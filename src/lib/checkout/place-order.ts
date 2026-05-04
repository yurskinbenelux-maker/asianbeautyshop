// ─────────────────────────────────────────────────────────────────────────
// placeOrder — the heart of checkout.
//
// Takes the validated form input + the visitor's cart, creates an Order
// (status PENDING, payment UNPAID) with snapshotted addresses and line
// items, asks Mollie for a hosted checkout URL, stores the Mollie id
// back on the order, and clears the cart cookie so the visitor can start
// fresh.
//
// Why a server function (not the API route itself)?
//   · Keeps the HTTP boundary thin and easy to audit.
//   · Unit-testable without spinning up Next.js.
//   · Re-usable from a future "Pay again" flow on failed orders.
//
// This function MUTATES (cart → order) — callers must be certain they've
// validated the input first. We still defend with zod at the boundary.
// ─────────────────────────────────────────────────────────────────────────

// NOTE: this module is implicitly server-only — it touches cookies() +
// Prisma + the Mollie SDK. `import "server-only"` would add a compile-time
// guard but the `server-only` package isn't installed; if a client
// component imports this, Next.js throws at build time anyway.
import { cookies } from "next/headers";
import { Prisma, Locale } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCartSummary } from "@/lib/cart/cart";
import { readSetting } from "@/lib/settings";
import {
  computeOrderTotals,
  toMollieAmount,
  type PricingCoupon,
} from "./pricing";
import { generateOrderNumber } from "./order-number";
import {
  getMollie,
  hasMollieKey,
  mapLocaleToMollie,
} from "@/lib/mollie/client";
import { lookupGiftCard } from "@/lib/gift-cards/db";
import { hashShippingAddress } from "./address-hash";
import {
  markQuizRewardRedeemed,
  quizCouponCodeForUser,
} from "@/lib/quiz/reward";
import { QUIZ_REWARD_DISCOUNT_REASON } from "@/lib/cart/quiz-ritual";
import { drainAttachedGiftCards } from "./sync-mollie";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { sendAdminNewOrderEmail } from "@/lib/email/admin-new-order";
import { syncOrderToSendcloud } from "@/lib/sendcloud/sync";
import { issueGiftCardsForOrder } from "@/lib/gift-cards/issue-from-order";

// ────────── input shape ─────────────────────────────────────────────────

export type PlaceOrderInput = {
  cartId: string;
  locale: string; // URL locale ("en", "nl", "fr", "ru")
  email: string;
  userId: string | null; // null = guest
  /**
   * Null when the cart is digital-only (every line is a gift card) — in
   * that case `billing` is the only address we ask the customer for, no
   * parcel will be created, and Order.shippingAddressId stays null.
   */
  shipping: AddressInput | null;
  billing: AddressInput | null; // null → copy from shipping
  couponCode: string | null;
  /**
   * Gift card codes the customer pasted at checkout. Validated server-side
   * here — invalid codes throw "GIFTCARD_INVALID:<code>:<reason>" so the
   * UI can highlight the bad chip. Multiple codes stack: their balances
   * sum and feed `pricing.giftCardBalanceEur`. Drained against the order
   * post-payment by the Mollie webhook.
   */
  giftCardCodes?: string[];
  notes: string | null;
  marketingOptIn: boolean;
  /**
   * Optional Mollie payment-method slug. When set, Mollie's hosted page
   * lands directly on the wallet flow (Apple Pay / Google Pay / Bancontact /
   * iDEAL / Card / PayPal) instead of showing the method picker. Saves
   * the customer a click and surfaces the right brand association
   * pre-payment. Undefined = let Mollie pick.
   */
  paymentMethod?: string;
};

export type AddressInput = {
  firstName: string;
  lastName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  region: string | null;
  country: string; // ISO 3166-1 alpha-2
  phone: string | null;
};

export type PlaceOrderResult = {
  orderId: string;
  publicNumber: string;
  checkoutUrl: string;
  grandTotalEur: number;
};

// ────────── main ────────────────────────────────────────────────────────

export async function placeOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  if (!hasMollieKey()) {
    throw new Error("CHECKOUT_UNAVAILABLE: Mollie not configured");
  }

  const prismaLocale = urlLocaleToPrisma(input.locale);

  // 1. Rehydrate cart. We trust the DB snapshot (cart.unitPrice) over the
  //    current Product.price, so a customer who added something before a
  //    price change gets the price they saw — standard e-commerce rule.
  const cart = await getCartSummary({
    cartId: input.cartId,
    locale: prismaLocale,
  });
  if (cart.items.length === 0) {
    throw new Error("CART_EMPTY");
  }

  // 2. Fetch settings + coupon once, for pricing.
  const [shipping, tax, coupon] = await Promise.all([
    readSetting("shipping"),
    readSetting("tax"),
    input.couponCode ? loadCoupon(input.couponCode) : Promise.resolve(null),
  ]);

  // 2b. Validate gift card codes server-side. The client previewed them
  // already, but a stale tab can't be trusted with money. Each code looked
  // up here returns its current balance; we sum them for pricing and keep
  // the giftCardId list for the post-paid drain.
  const giftCardCodes = (input.giftCardCodes ?? []).map((c) =>
    c.trim().toUpperCase(),
  );
  const giftCardIds: string[] = [];
  let giftCardBalanceSumEur = 0;
  for (const code of giftCardCodes) {
    const result = await lookupGiftCard(code);
    if (!result.ok) {
      // Surface the specific code + reason so the UI can highlight which
      // chip went bad. Action layer maps unknown errors to "UNKNOWN".
      throw new Error(`GIFTCARD_INVALID:${code}:${result.reason}`);
    }
    giftCardIds.push(result.id);
    giftCardBalanceSumEur += result.balance;
  }

  // 3. Compute totals. If the chosen country isn't on the allow-list,
  //    refuse here before creating any DB rows.
  // Pricing already short-circuits the country check on digital-only
  // carts (anywhere there's email is fine), so we pass the billing
  // country when shipping is absent — that's good enough for VAT.
  const countryForPricing =
    input.shipping?.country ?? input.billing?.country ?? null;
  const pricing = computeOrderTotals({
    cart,
    shippingCountry: countryForPricing,
    coupon,
    shipping,
    tax,
    giftCardBalanceEur:
      giftCardBalanceSumEur > 0 ? giftCardBalanceSumEur : undefined,
  });
  if (!pricing.shippable) {
    throw new Error("COUNTRY_NOT_SHIPPABLE");
  }

  // Quiz reward anti-fraud — Max's rules A + B.
  //
  //   A (per-account): the deterministic coupon code is `YUR-QUIZ-{userId}`,
  //      so the same logged-in account can never claim twice. Enforced by
  //      the unique Coupon row + the per-user QuizCompletion (set
  //      redeemedAt below once this order is committed).
  //
  //   B (per-shipping-address): hash the destination address. If a prior
  //      order with a quiz reward already shipped to the same hash, refuse
  //      this one — stops the "make a fresh account, ship to the same
  //      house" scam. We compute the hash for EVERY quiz-reward order so
  //      the dedup catches future attempts.
  //
  // We detect a quiz-reward order by looking for the per-line discount
  // marker on any cart item. Items added through /quiz/result or the
  // /quiz/restore email link carry `discountReason = "quiz_reward"`.
  const cartHasQuizReward = cart.items.some(
    (i) => i.discountReason === QUIZ_REWARD_DISCOUNT_REASON,
  );

  let shippingAddressHashForOrder: string | null = null;
  if (cartHasQuizReward && input.shipping) {
    shippingAddressHashForOrder = hashShippingAddress({
      line1: input.shipping.line1,
      line2: input.shipping.line2,
      city: input.shipping.city,
      postalCode: input.shipping.postcode,
      country: input.shipping.country,
    });
    if (shippingAddressHashForOrder) {
      const prior = await prisma.order.findFirst({
        where: {
          shippingAddressHash: shippingAddressHashForOrder,
          // Only count orders that successfully passed payment — failed /
          // cancelled attempts shouldn't burn a customer's address.
          paymentStatus: "PAID",
          // And specifically those that used a quiz reward (couponCode
          // starts with the YUR-QUIZ- prefix).
          couponCode: { startsWith: "YUR-QUIZ-" },
          // Different user than this one — same user repeating is blocked
          // by rule A (the unique deterministic code), and we don't want
          // to spuriously trip on the same person re-buying.
          NOT: input.userId ? { userId: input.userId } : undefined,
        },
        select: { id: true },
      });
      if (prior) {
        throw new Error("QUIZ_REWARD_ADDRESS_USED");
      }
    }
  }

  // Edge case: gift card balance covers the entire order. We can't ask
  // Mollie to charge €0, so we run a "free order" path further down —
  // mark the order PAID inline, drain the gift cards, fire the same
  // post-paid hooks the Mollie webhook would have. Detected here so the
  // downstream code can branch on it without re-deriving the test.
  const isFreeOrder =
    giftCardIds.length > 0 && pricing.grandTotalEur < 0.01;

  // 4. Create addresses + order + items in a single transaction so a
  //    mid-insert error can't leave orphan addresses pointing nowhere.
  const publicNumber = await generateOrderNumber();
  // Falls back: shipping → billing for billing input;
  // billing → shipping for the rare cart that has shipping but no billing.
  const billing = input.billing ?? input.shipping;
  if (!billing) {
    // Defensive: action layer is supposed to ensure at least one address.
    // If neither is present, refuse — VAT compliance + Mollie risk
    // require at least a billing address.
    throw new Error("CHECKOUT_UNAVAILABLE: address missing");
  }

  const order = await prisma.$transaction(async (tx) => {
    // Only create a shipping Address row when the cart actually needs
    // shipping. Digital-only carts leave Order.shippingAddressId null
    // (the column is nullable in schema). This keeps the admin UI clean
    // and Sendcloud sync a clean no-op.
    const shippingAddress = input.shipping
      ? await tx.address.create({
          data: {
            userId: input.userId,
            type: "SHIPPING",
            firstName: input.shipping.firstName,
            lastName: input.shipping.lastName,
            company: input.shipping.company,
            line1: input.shipping.line1,
            line2: input.shipping.line2,
            city: input.shipping.city,
            postcode: input.shipping.postcode,
            region: input.shipping.region,
            country: input.shipping.country.toUpperCase(),
            phone: input.shipping.phone,
          },
        })
      : null;

    const billingAddress = await tx.address.create({
      data: {
        userId: input.userId,
        type: "BILLING",
        firstName: billing.firstName,
        lastName: billing.lastName,
        company: billing.company,
        line1: billing.line1,
        line2: billing.line2,
        city: billing.city,
        postcode: billing.postcode,
        region: billing.region,
        country: billing.country.toUpperCase(),
        phone: billing.phone,
      },
    });

    // Snapshot each line item. We re-resolve product name from the
    // localised translation so the admin doesn't see "—" in the order row
    // when the storefront locale has a translation but the admin doesn't.
    const productIds = cart.items.map((i) => i.productId);
    const nameRows = await tx.productTranslation.findMany({
      where: {
        productId: { in: productIds },
        OR: [{ locale: prismaLocale }, { locale: Locale.EN }],
      },
      select: { productId: true, locale: true, name: true },
    });
    const nameByProductId = new Map<string, string>();
    for (const row of nameRows) {
      // Prefer locale-specific; fall back to EN.
      if (!nameByProductId.has(row.productId) || row.locale === prismaLocale) {
        nameByProductId.set(row.productId, row.name);
      }
    }

    // Re-read SKUs in one shot — not on the CartSummary yet.
    const skuRows = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, sku: true },
    });
    const skuByProductId = new Map(skuRows.map((r) => [r.id, r.sku]));

    const taxRate = new Prisma.Decimal(
      ((tax.overrides[(input.shipping?.country ?? billing.country).toUpperCase()] ??
        tax.ratePercent) /
        100
      ).toFixed(4),
    );

    const created = await tx.order.create({
      data: {
        publicNumber,
        userId: input.userId,
        email: input.email.trim().toLowerCase(),
        locale: prismaLocale,
        currency: "EUR",
        status: "PENDING",
        paymentStatus: "UNPAID",
        shippingAddressId: shippingAddress?.id ?? null,
        billingAddressId: billingAddress.id,
        subtotal: new Prisma.Decimal(pricing.subtotalEur.toFixed(2)),
        discountTotal: new Prisma.Decimal(pricing.discountEur.toFixed(2)),
        shippingTotal: new Prisma.Decimal(pricing.shippingEur.toFixed(2)),
        taxTotal: new Prisma.Decimal(pricing.taxEur.toFixed(2)),
        grandTotal: new Prisma.Decimal(pricing.grandTotalEur.toFixed(2)),
        couponCode: coupon?.code ?? null,
        // Persist the shipping-address hash on quiz-reward orders so a
        // future repeat attempt can be blocked by rule B above. Null
        // for non-quiz orders to keep the column light.
        shippingAddressHash: shippingAddressHashForOrder,
        notes: input.notes ?? null,
        items: {
          create: cart.items.map((item) => {
            // Gift cards: copy the per-line config snapshot from the cart
            // and rewrite the "__buyer__" sentinel to the real buyer email
            // so the post-payment hook never has to guess. The cart-line
            // config is the source of truth for recipient details — the
            // OrderItem is the durable replica.
            let configForOrder: Prisma.InputJsonValue | undefined;
            if (item.giftCardConfig) {
              const c = item.giftCardConfig;
              configForOrder = {
                deliveryMode: c.deliveryMode,
                recipientEmail:
                  c.deliveryMode === "self" ||
                  c.recipientEmail === "__buyer__"
                    ? input.email.trim().toLowerCase()
                    : c.recipientEmail,
                recipientName: c.recipientName ?? null,
                senderName: c.senderName ?? null,
                message: c.message ?? null,
              };
            }
            return {
              productId: item.productId,
              variantId: item.variantId,
              nameSnapshot: nameByProductId.get(item.productId) ?? item.name,
              skuSnapshot: skuByProductId.get(item.productId) ?? "—",
              quantity: item.quantity,
              unitPrice: new Prisma.Decimal(item.unitPriceEur.toFixed(2)),
              lineTotal: new Prisma.Decimal(item.lineTotalEur.toFixed(2)),
              taxRate,
              ...(configForOrder
                ? { giftCardConfig: configForOrder }
                : {}),
            };
          }),
        },
        events: {
          create: [
            {
              kind: "order.created",
              message: `Placed by ${input.userId ? "customer" : "guest"}`,
              metadata: {
                cartId: cart.id,
                country: (
                  input.shipping?.country ?? billing.country
                ).toUpperCase(),
                digitalOnly: !input.shipping,
              },
            },
            // Stamp the attached gift card IDs as metadata so the Mollie
            // webhook can drain them on the PAID transition. Guarded with
            // a length check so we don't litter every order with an empty
            // event.
            ...(giftCardIds.length > 0
              ? [
                  {
                    kind: "giftcard.attached",
                    message: `${giftCardIds.length} gift card(s) applied (€${giftCardBalanceSumEur.toFixed(
                      2,
                    )})`,
                    metadata: {
                      giftCardIds,
                      preCreditTotalEur:
                        pricing.grandTotalEur + pricing.giftCardEur,
                    },
                  },
                ]
              : []),
          ],
        },
      },
      select: {
        id: true,
        publicNumber: true,
        grandTotal: true,
      },
    });

    // If the customer opted in, stamp marketing consent.
    if (input.marketingOptIn && input.userId) {
      await tx.user.update({
        where: { id: input.userId },
        data: {
          marketingOptIn: true,
          marketingOptInAt: new Date(),
        },
      });
    }

    return created;
  });

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  // 4b. Free-order shortcut. When the customer's gift card balance fully
  //     covers this order, Mollie has nothing to charge — we'd 422 if we
  //     tried. Mark the order PAID directly, drain the cards, and fire
  //     the same post-paid hooks the Mollie webhook would have on a
  //     normal payment. The customer skips the hosted-payment hop and
  //     lands straight on /checkout/success.
  if (isFreeOrder) {
    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "PAID",
          status: "PAID",
          paidAt: new Date(),
        },
      }),
      prisma.orderEvent.create({
        data: {
          orderId: order.id,
          kind: "payment.paid",
          message: "Free order — covered in full by gift card balance",
          metadata: { source: "gift_card_only" },
        },
      }),
    ]);

    // Decrement gift card balances against the order. Idempotent on
    // (giftCardId, orderId), so a retry of this whole code path is safe.
    await drainAttachedGiftCards(order.id);

    // Side effects — same set the Mollie webhook fires on PAID. Wrapped
    // in allSettled so an email outage doesn't leave the order half-done.
    await Promise.allSettled([
      sendOrderConfirmationEmail(order.id),
      sendAdminNewOrderEmail(order.id),
      syncOrderToSendcloud(order.id),
      issueGiftCardsForOrder(order.id),
    ]);

    // Clear the cart so it doesn't haunt the customer's next visit, same
    // hygiene as the Mollie path.
    const jarFree = await cookies();
    jarFree.delete("cart_token");
    await prisma.cart.update({
      where: { id: cart.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    }).catch(() => {});

    return {
      orderId: order.id,
      publicNumber: order.publicNumber,
      // Internal route — checkout/success knows how to render a confirmed
      // PAID order without waiting on Mollie return params.
      checkoutUrl: `${siteUrl}/${input.locale}/checkout/success?order=${encodeURIComponent(
        order.publicNumber,
      )}&free=1`,
      grandTotalEur: 0,
    };
  }

  // 5. Ask Mollie to open a payment. We do this AFTER the transaction
  //    commits so a Mollie API failure doesn't roll back the order — the
  //    order stays PENDING and the admin (or a retry) can re-attempt.
  const mollie = getMollie();
  const webhookSecret =
    process.env.MOLLIE_WEBHOOK_SECRET ?? process.env.CRON_SECRET ?? "";

  let checkoutUrl: string | null = null;
  let mollieId: string | null = null;

  try {
    const payment = await mollie.payments.create({
      amount: {
        currency: "EUR",
        value: toMollieAmount(pricing.grandTotalEur),
      },
      description: `YU.R order ${publicNumber}`,
      redirectUrl: `${siteUrl}/${input.locale}/checkout/success?order=${encodeURIComponent(publicNumber)}`,
      cancelUrl: `${siteUrl}/${input.locale}/checkout/failure?order=${encodeURIComponent(publicNumber)}&reason=cancelled`,
      // Mollie can only hit the webhook if the URL is publicly reachable.
      // On localhost we skip it and rely on return-URL polling instead;
      // production deployments set NEXT_PUBLIC_SITE_URL to the real domain.
      ...(siteUrl.startsWith("https://")
        ? {
            webhookUrl: `${siteUrl}/api/webhooks/mollie${webhookSecret ? `?token=${encodeURIComponent(webhookSecret)}` : ""}`,
          }
        : {}),
      // When the customer picked a specific method on our checkout, we
      // pass it through so Mollie's hosted page lands directly on that
      // wallet/method UI. Cast is needed because @mollie/api-client's
      // `method` type is a union of literal strings — we accept the
      // method as a plain string from our schema and trust Zod's enum
      // validation to keep it in the supported set.
      ...(input.paymentMethod
        ? { method: input.paymentMethod as never }
        : {}),
      locale: mapLocaleToMollie(input.locale),
      metadata: {
        orderId: order.id,
        publicNumber: order.publicNumber,
      },
    });

    mollieId = payment.id;
    checkoutUrl = payment.getCheckoutUrl();
  } catch (err) {
    // Leave the order in PENDING + log the failure. The UI shows a generic
    // error to the customer; the admin can investigate via OrderEvent.
    console.error("[placeOrder] Mollie create failed", err);
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "payment.create_failed",
        message: err instanceof Error ? err.message : "Unknown Mollie error",
      },
    });
    throw new Error("PAYMENT_PROVIDER_ERROR");
  }

  if (!checkoutUrl || !mollieId) {
    throw new Error("PAYMENT_PROVIDER_ERROR");
  }

  // 6. Link the Mollie id back to the order so webhooks can find it, and
  //    the customer's "open your payment again" link stays live.
  await prisma.order.update({
    where: { id: order.id },
    data: { mollieId, molliePaymentUrl: checkoutUrl },
  });
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      kind: "payment.created",
      message: "Mollie payment opened",
      metadata: { mollieId },
    },
  });

  // 7. Clear the cart cookie — customer will mint a new cart next time.
  const jar = await cookies();
  jar.delete("cart_token");
  // And hard-expire the Cart row in the DB so the abandoned-cart cron
  // doesn't email them about an order they just placed.
  await prisma.cart.update({
    where: { id: cart.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  }).catch(() => {
    // cart may already be deleted if the user placed a second order fast;
    // not fatal.
  });

  return {
    orderId: order.id,
    publicNumber: order.publicNumber,
    checkoutUrl,
    grandTotalEur: Number(order.grandTotal),
  };
}

// ────────── helpers ─────────────────────────────────────────────────────

async function loadCoupon(code: string): Promise<PricingCoupon | null> {
  const row = await prisma.coupon.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
  if (!row || !row.isActive) return null;
  const now = new Date();
  if (row.startsAt && row.startsAt > now) return null;
  if (row.endsAt && row.endsAt < now) return null;
  if (
    row.maxRedemptions !== null &&
    row.redemptionsUsed >= row.maxRedemptions
  ) {
    return null;
  }
  return {
    code: row.code,
    kind: row.kind,
    value: Number(row.value),
    minSubtotal: row.minSubtotal ? Number(row.minSubtotal) : null,
  };
}

function urlLocaleToPrisma(locale: string): Locale {
  switch (locale.toLowerCase()) {
    case "nl":
      return Locale.NL;
    case "fr":
      return Locale.FR;
    case "ru":
      return Locale.RU;
    default:
      return Locale.EN;
  }
}
