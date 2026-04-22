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
};

export type PricingResult = {
  subtotalEur: number; // sum of line totals
  discountEur: number; // coupon value actually applied
  shippingEur: number; // final shipping charge after coupon + threshold
  taxEur: number; // VAT; derived if tax.includedInPrice, otherwise added
  grandTotalEur: number; // what the customer pays
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

  // 2. Shippability — if we have an address country but it's not on the
  //    allow-list, return a marker the UI can show as "we don't ship there".
  //    If no country yet (pre-address), treat as shippable so the summary
  //    still renders an estimate.
  const shippable =
    !shippingCountry ||
    shipping.allowedCountries.length === 0 ||
    shipping.allowedCountries.includes(shippingCountry.toUpperCase());

  if (!shippable) {
    return {
      subtotalEur,
      discountEur: 0,
      shippingEur: 0,
      taxEur: 0,
      grandTotalEur: subtotalEur,
      currency: "EUR",
      shippingReason: "unshippable",
      shippable: false,
    };
  }

  // 3. Base shipping — free-over-threshold or flat-rate.
  const freeThresholdEur = centsToEur(shipping.freeThresholdCents);
  const flatRateEur = centsToEur(shipping.flatRateCents);

  let shippingEur: number;
  let shippingReason: PricingResult["shippingReason"];
  if (freeThresholdEur > 0 && subtotalEur >= freeThresholdEur) {
    shippingEur = 0;
    shippingReason = "free_threshold";
  } else {
    shippingEur = flatRateEur;
    shippingReason = "flat_rate";
  }

  // 4. Coupon → discountEur + possibly override shippingEur.
  //    minSubtotal gate: if the cart doesn't clear the threshold, the
  //    coupon silently doesn't apply. The UI is expected to validate
  //    this BEFORE calling us — but we defend anyway.
  let discountEur = 0;
  if (coupon && (coupon.minSubtotal ?? 0) <= subtotalEur) {
    if (coupon.kind === "PERCENT") {
      discountEur = round2((subtotalEur * coupon.value) / 100);
    } else if (coupon.kind === "FIXED") {
      discountEur = Math.min(subtotalEur, round2(coupon.value));
    } else if (coupon.kind === "FREE_SHIPPING") {
      shippingEur = 0;
      shippingReason = "coupon_free_shipping";
    }
  }

  // 5. Taxable base + VAT.
  //    We apply the coupon discount to the product subtotal (not shipping)
  //    before tax — this matches the EU "price you actually paid" rule.
  const ratePercent =
    (shippingCountry && tax.overrides[shippingCountry.toUpperCase()]) ??
    tax.ratePercent;
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

  return {
    subtotalEur,
    discountEur,
    shippingEur,
    taxEur,
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
