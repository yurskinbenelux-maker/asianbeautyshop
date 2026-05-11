// ─────────────────────────────────────────────────────────────────────────
// Checkout pricing — subtotal → discount → shipping → tax → grandTotal.
//
// This is the ONE place that decides what a customer pays. Shop pages,
// the cart summary, the checkout form, the order-placement code, and the
// confirmation email all go through this function so they never disagree
// on a cent.
//
// Conventions:
//   · All amounts are EUR decimals rounded to 2 places. Prisma columns are
//     Decimal(10,2). We work in numbers internally and only convert at the
//     edges.
//   · "Included VAT" mode (the default in EU retail): product prices
//     already contain VAT, so tax is a DERIVED figure shown for the
//     receipt — grandTotal = subtotal + shipping − discount.
//   · "Excluded VAT" mode: prices are net; tax is ADDED to the grandTotal.
//     This is what you'd use for B2B storefronts.
//
// If you change the rules here, make sure the UI and the email templates
// re-read the returned shape — they already do, so you shouldn't have to
// touch them.
// ─────────────────────────────────────────────────────────────────────────

import type { CartSummary } from "@/lib/cart/types";
import type { ShippingSettings, TaxSettings } from "@/lib/settings";

// ────────── types ───────────────────────────────────────────────────────

/**
 * Coupon shape as we need it for pricing. Kept minimal so place-order.ts
 * can fetch only what it needs (not the whole Coupon row) — keeps the
 * pricing function easy to unit-test.
 */
export type PricingCoupon = {
  code: string;
  kind: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number; // percent 0-100, or EUR amount
  minSubtotal: number | null;
};

export type PricingInput = {
  cart: CartSummary;
  shippingCountry: string | null;
  coupon: PricingCoupon | null;
  shipping: ShippingSettings;
  tax: TaxSettings;
  /**
   * Optional gift-card balance available at apply time. We subtract
   * `min(balance, post-tax total)` so a customer with a €100 card and
   * a €40 cart pays nothing through Mollie and the card retains €60.
   */
  giftCardBalanceEur?: number;
};

export type PricingResult = {
  subtotalEur: number; // sum of line totals
  /**
   * Sum of line totals for items that are ELIGIBLE for coupon discounts —
   * i.e. excludes gift cards (gift cards are a payment instrument, not a
   * product, and must never be discounted). Equals `subtotalEur` when the
   * cart has no gift cards.
   */
  eligibleSubtotalEur: number;
  discountEur: number; // coupon value actually applied
  /**
   * Effective discount rate applied to eligible items, in PERCENT (0-100).
   * 0 when no coupon is active. The cart summary uses this to render the
   * per-line strikethrough next to each eligible product line.
   */
  discountRate: number;
  shippingEur: number; // final shipping charge after coupon + threshold
  taxEur: number; // VAT; derived if tax.includedInPrice, otherwise added
  /**
   * Amount applied from a gift-card balance towards this order. Subtracted
   * from grandTotal so the customer's Mollie charge equals only what's
   * actually owed in cash.
   */
  giftCardEur: number;
  grandTotalEur: number; // what the customer pays after gift-card credit
  currency: "EUR";
  /**
   * Ready-made reason text for the shipping line, so the UI can show
   * "Free over €75" vs "Flat rate" without re-deriving the logic.
   */
  shippingReason:
    | "free_threshold"
    | "coupon_free_shipping"
    | "flat_rate"
    | "unshippable";
  /** If the country isn't on the allow-list, we can't quote. */
  shippable: boolean;
};

// ────────── public API ──────────────────────────────────────────────────

export function computeOrderTotals(input: PricingInput): PricingResult {
  const { cart, shippingCountry, coupon, shipping, tax } = input;

  // 1. Subtotal — trust the cart summary (already rounded to 2dp).
  const subtotalEur = round2(cart.subtotalEur);

  // 1b. Eligible-subtotal — the portion of the cart on which a coupon can
  //     apply. Gift cards (items with `requiresShipping === false` AND no
  //     shippable counterpart — i.e. digital prepaid balance) are NEVER
  //     discounted: they are a payment instrument, not a product. A 5%
  //     coupon on a cart of [€45 cream + 2×€100 gift card] must discount
  //     €2.25 (5% × €45), not €12.25 (5% × €245).
  //
  //     We use `requiresShipping` as the gift-card sentinel because that's
  //     the same flag CartSummary uses to flip the shipping logic above —
  //     keeps both pieces of business logic in sync.
  const eligibleSubtotalEur = round2(
    cart.items
      .filter((i) => i.requiresShipping)
      .reduce((sum, i) => sum + i.lineTotalEur, 0),
  );

  // 2. Shippability — if we have an address country but it's not on the
  //    allow-list, return a marker the UI can show as "we don't ship there".
  //    If no country yet (pre-address), treat as shippable so the summary
  //    still renders an estimate.
  //
  //    Digital-only carts bypass the allow-list entirely — gift cards can
  //    be sent anywhere there's email.
  const cartHasPhysical =
    cart.items.length === 0 || cart.items.some((i) => i.requiresShipping);
  const shippable =
    !cartHasPhysical ||
    !shippingCountry ||
    shipping.allowedCountries.length === 0 ||
    shipping.allowedCountries.includes(shippingCountry.toUpperCase());

  if (!shippable) {
    return {
      subtotalEur,
      eligibleSubtotalEur,
      discountEur: 0,
      discountRate: 0,
      shippingEur: 0,
      taxEur: 0,
      giftCardEur: 0,
      grandTotalEur: subtotalEur,
      currency: "EUR",
      shippingReason: "unshippable",
      shippable: false,
    };
  }

  // 3. Base shipping — free-over-threshold or flat-rate.
  //    Digital-only carts (every item is a gift card) skip shipping
  //    entirely — there's nothing to put in a parcel. We treat that as
  //    `free_threshold` reason since the customer doesn't need to know
  //    the internal logic; the UI just renders "Free".
  const freeThresholdEur = centsToEur(shipping.freeThresholdCents);
  const flatRateEur = centsToEur(shipping.flatRateCents);
  const cartIsDigitalOnly =
    cart.items.length > 0 && cart.items.every((i) => !i.requiresShipping);

  let shippingEur: number;
  let shippingReason: PricingResult["shippingReason"];
  if (cartIsDigitalOnly) {
    shippingEur = 0;
    shippingReason = "free_threshold";
  } else if (
    freeThresholdEur > 0 &&
    // Free-shipping threshold compares against the ELIGIBLE subtotal
    // (excludes gift cards). A customer can't pad their cart with €100
    // gift cards to clip past the €80 free-shipping threshold — the
    // threshold is a reward for spending on shippable products.
    eligibleSubtotalEur >= freeThresholdEur
  ) {
    shippingEur = 0;
    shippingReason = "free_threshold";
  } else {
    shippingEur = flatRateEur;
    shippingReason = "flat_rate";
  }

  // 4a. Per-line discounts — currently only the quiz reward (15%
  //     applied to the items added via "Add my ritual to cart"). Each
  //     line carries its own discountPercent; we sum them into a
  //     single line-discount total. Coupons CANNOT stack with per-line
  //     discounts (Max's rule), so any coupon submitted alongside a
  //     line discount is silently ignored. The cart UI is expected to
  //     hide the coupon-code input in this case — this is defence in
  //     depth.
  let lineDiscountEur = 0;
  for (const item of cart.items) {
    if (
      item.discountPercent &&
      item.discountPercent > 0 &&
      item.discountPercent <= 100
    ) {
      const lineGross = round2(item.unitPriceEur * item.quantity);
      lineDiscountEur += round2(
        (lineGross * item.discountPercent) / 100,
      );
    }
  }
  lineDiscountEur = round2(lineDiscountEur);

  // 4b. Coupon → discountEur + possibly override shippingEur.
  //    minSubtotal gate: uses the ELIGIBLE subtotal (excludes gift cards)
  //    so somebody can't stack €100 of gift cards just to clear a "spend
  //    €75 to apply" threshold.
  //
  //    The discount ALSO applies only to the eligible subtotal. A 5%
  //    coupon on [€45 cream + 2×€100 gift card] takes €2.25 off, not
  //    €12.25.
  //
  //    SKIP entirely if the cart already has any per-line discount —
  //    coupons CANNOT stack with the quiz reward (Max's rule).
  let discountEur = lineDiscountEur;
  let discountRate = 0; // percent (0-100), used by the UI to render strikethroughs
  if (
    lineDiscountEur === 0 &&
    coupon &&
    eligibleSubtotalEur > 0 &&
    (coupon.minSubtotal ?? 0) <= eligibleSubtotalEur
  ) {
    if (coupon.kind === "PERCENT") {
      discountEur = round2((eligibleSubtotalEur * coupon.value) / 100);
      discountRate = coupon.value;
    } else if (coupon.kind === "FIXED") {
      discountEur = Math.min(eligibleSubtotalEur, round2(coupon.value));
      // Derive an effective rate so the UI can still render "−X%" markers
      // on each eligible line. e.g. €10 off a €40 eligible base ⇒ 25%.
      discountRate =
        eligibleSubtotalEur > 0
          ? round2((discountEur / eligibleSubtotalEur) * 100)
          : 0;
    } else if (coupon.kind === "FREE_SHIPPING") {
      shippingEur = 0;
      shippingReason = "coupon_free_shipping";
    }
  }

  // 5. Taxable base + VAT.
  //    We apply the coupon discount to the product subtotal (not shipping)
  //    before tax — this matches the EU "price you actually paid" rule.
  // NB: `shippingCountry && x` would widen to `string | number` when the
  // country is an empty string, which TS then refuses to divide. Split
  // it into a plain ternary so the result is always `number`.
  const overrideRate = shippingCountry
    ? tax.overrides[shippingCountry.toUpperCase()]
    : undefined;
  const ratePercent = overrideRate ?? tax.ratePercent;
  const rate = ratePercent / 100;

  const netSubtotal = Math.max(0, subtotalEur - discountEur);
  const netTaxable = netSubtotal + shippingEur;

  let taxEur: number;
  let grandTotalEur: number;
  if (tax.includedInPrice) {
    // Prices INCLUDE VAT. Tax is a derived figure for the receipt.
    // grandTotal = net prices as stored − no extra addition.
    taxEur = round2(netTaxable - netTaxable / (1 + rate));
    grandTotalEur = round2(netTaxable);
  } else {
    // Prices EXCLUDE VAT. Tax is added on top.
    taxEur = round2(netTaxable * rate);
    grandTotalEur = round2(netTaxable + taxEur);
  }

  // 6. Gift-card credit — applied AFTER tax + shipping because it's a
  // payment instrument (like cash), not a discount on the price. Caps at
  // the available balance and at the post-tax total so we never go negative.
  const giftCardEur =
    input.giftCardBalanceEur && input.giftCardBalanceEur > 0
      ? round2(Math.min(input.giftCardBalanceEur, grandTotalEur))
      : 0;
  grandTotalEur = round2(grandTotalEur - giftCardEur);

  return {
    subtotalEur,
    eligibleSubtotalEur,
    discountEur,
    discountRate,
    shippingEur,
    taxEur,
    giftCardEur,
    grandTotalEur,
    currency: "EUR",
    shippingReason,
    shippable: true,
  };
}

// ────────── helpers ─────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function centsToEur(cents: number): number {
  return round2(cents / 100);
}

/** Format an EUR decimal as a Mollie-compatible string (always 2 digits). */
export function toMollieAmount(eur: number): string {
  return eur.toFixed(2);
}
