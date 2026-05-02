// ─────────────────────────────────────────────────────────────────────────
// getOrderForEmail — one query that returns everything any transactional
// email template could need: order + items (with localised name + primary
// image) + shipping address.
//
// Called from the three order mail helpers (confirmation, shipped, admin
// alert) so the data shape is consistent and we hit the database once.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EmailOrderItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  /**
   * "GIFT_CARD" for digital lines, "STANDARD" otherwise. Email templates
   * branch on `items.every(i => i.kind === "GIFT_CARD")` to switch from
   * shipping copy to digital-delivery copy.
   */
  kind: "STANDARD" | "GIFT_CARD";
};

export type EmailOrderAddress = {
  firstName: string | null;
  lastName: string | null;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  region: string | null;
  country: string;
};

export type EmailOrder = {
  id: string;
  publicNumber: string;
  email: string;
  locale: Locale;
  placedAt: Date;
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  invoiceUrl: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  itemCount: number;
  items: EmailOrderItem[];
  shippingAddress: EmailOrderAddress | null;
  /** Display name chosen from shippingAddress or User — used in greetings. */
  customerFirstName: string | null;
};

/**
 * Load an order shaped for email rendering. Returns null if the order
 * doesn't exist — callers should log & skip sending rather than crash.
 *
 * `locale` argument picks which ProductTranslation to prefer for names.
 * Falls back to the order's own locale if omitted, and to EN within
 * each item's translation list if the target locale has no row.
 */
export async function getOrderForEmail(
  orderId: string,
  locale?: Locale,
): Promise<EmailOrder | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      shippingAddress: true,
      items: {
        // OrderItem has no createdAt; id ordering gives us a stable, roughly
        // insertion-ordered list for email rendering.
        orderBy: { id: "asc" },
        include: {
          product: {
            select: {
              kind: true,
              translations: {
                select: { locale: true, name: true, slug: true },
              },
              media: {
                where: { isPrimary: true },
                select: { url: true },
                take: 1,
              },
            },
          },
          variant: {
            select: { id: true, label: true },
          },
        },
      },
    },
  });

  if (!order) return null;

  const targetLocale = locale ?? order.locale;

  const items: EmailOrderItem[] = order.items.map((it) => {
    // Prefer the target-locale translation; fall back to EN, then first.
    const translations = it.product?.translations ?? [];
    const preferred =
      translations.find((t) => t.locale === targetLocale) ??
      translations.find((t) => t.locale === Locale.EN) ??
      translations[0];

    const name = it.nameSnapshot || preferred?.name || "Product";
    const slug = preferred?.slug ?? "";

    const unitPrice = Number(it.unitPrice);
    const quantity = it.quantity;
    const lineTotal = Number(it.lineTotal);

    return {
      id: it.id,
      quantity,
      unitPrice,
      lineTotal,
      productName: it.variant?.label ? `${name} — ${it.variant.label}` : name,
      productSlug: slug,
      imageUrl: it.product?.media?.[0]?.url ?? null,
      kind:
        it.product?.kind === "GIFT_CARD" ? "GIFT_CARD" : "STANDARD",
    };
  });

  const addr = order.shippingAddress;
  const shippingAddress: EmailOrderAddress | null = addr
    ? {
        firstName: addr.firstName,
        lastName: addr.lastName,
        line1: addr.line1,
        line2: addr.line2,
        city: addr.city,
        postcode: addr.postcode,
        region: addr.region,
        country: addr.country,
      }
    : null;

  // Pick the best first name we can find. Priority:
  //   1. ship-to first name (most relevant to "Hi X, your order…")
  //   2. registered user first name
  //   3. null → templates render a generic "Hello,"
  const customerFirstName =
    shippingAddress?.firstName ?? order.user?.firstName ?? null;

  return {
    id: order.id,
    publicNumber: order.publicNumber,
    email: order.email,
    locale: order.locale,
    placedAt: order.placedAt,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    discountTotal: Number(order.discountTotal),
    shippingTotal: Number(order.shippingTotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    invoiceUrl: order.invoiceUrl,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    itemCount: items.reduce((sum, it) => sum + it.quantity, 0),
    items,
    shippingAddress,
    customerFirstName,
  };
}

/**
 * Format amount for email display. We pick an `Intl.NumberFormat` by
 * locale so Europeans see "€ 24,50" and English speakers see "€24.50".
 */
export function formatEmailMoney(
  amount: number,
  currency: string,
  locale: Locale,
): string {
  const l =
    locale === Locale.NL
      ? "nl-NL"
      : locale === Locale.FR
        ? "fr-FR"
        : locale === Locale.RU
          ? "ru-RU"
          : "en-GB";
  try {
    return new Intl.NumberFormat(l, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
    }).format(amount);
  } catch {
    // Defensive: some environments/currencies throw. Fall back to a plain
    // "€ 24.50" format that webmail can render safely.
    return `${currency} ${amount.toFixed(2)}`;
  }
}
