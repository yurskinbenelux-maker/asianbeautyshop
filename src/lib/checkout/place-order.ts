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

// ────────── input shape ─────────────────────────────────────────────────

export type PlaceOrderInput = {
  cartId: string;
  locale: string; // URL locale ("en", "nl", "fr", "ru")
  email: string;
  userId: string | null; // null = guest
  shipping: AddressInput;
  billing: AddressInput | null; // null → copy from shipping
  couponCode: string | null;
  notes: string | null;
  marketingOptIn: boolean;
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

  // 3. Compute totals. If the chosen country isn't on the allow-list,
  //    refuse here before creating any DB rows.
  const pricing = computeOrderTotals({
    cart,
    shippingCountry: input.shipping.country,
    coupon,
    shipping,
    tax,
  });
  if (!pricing.shippable) {
    throw new Error("COUNTRY_NOT_SHIPPABLE");
  }

  // 4. Create addresses + order + items in a single transaction so a
  //    mid-insert error can't leave orphan addresses pointing nowhere.
  const publicNumber = await generateOrderNumber();
  const billing = input.billing ?? input.shipping;

  const order = await prisma.$transaction(async (tx) => {
    const shippingAddress = await tx.address.create({
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
    });

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
      ((tax.overrides[input.shipping.country.toUpperCase()] ??
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
        shippingAddressId: shippingAddress.id,
        billingAddressId: billingAddress.id,
        subtotal: new Prisma.Decimal(pricing.subtotalEur.toFixed(2)),
        discountTotal: new Prisma.Decimal(pricing.discountEur.toFixed(2)),
        shippingTotal: new Prisma.Decimal(pricing.shippingEur.toFixed(2)),
        taxTotal: new Prisma.Decimal(pricing.taxEur.toFixed(2)),
        grandTotal: new Prisma.Decimal(pricing.grandTotalEur.toFixed(2)),
        couponCode: coupon?.code ?? null,
        notes: input.notes ?? null,
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            nameSnapshot: nameByProductId.get(item.productId) ?? item.name,
            skuSnapshot: skuByProductId.get(item.productId) ?? "—",
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPriceEur.toFixed(2)),
            lineTotal: new Prisma.Decimal(item.lineTotalEur.toFixed(2)),
            taxRate,
          })),
        },
        events: {
          create: {
            kind: "order.created",
            message: `Placed by ${input.userId ? "customer" : "guest"}`,
            metadata: {
              cartId: cart.id,
              country: input.shipping.country.toUpperCase(),
            },
          },
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

  // 5. Ask Mollie to open a payment. We do this AFTER the transaction
  //    commits so a Mollie API failure doesn't roll back the order — the
  //    order stays PENDING and the admin (or a retry) can re-attempt.
  const mollie = getMollie();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
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
