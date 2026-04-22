// ─────────────────────────────────────────────────────────────────────────
// Order queries for the customer account area.
//
// Guest checkouts have userId = null; those are never shown here — the
// logged-in account view only lists orders the user placed while signed in.
// If a customer wants to see a guest order, they click the link in the
// confirmation email (handled elsewhere).
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

export type MyOrderListItem = {
  id: string;
  publicNumber: string;
  status: string;
  placedAt: Date;
  itemCount: number;
  grandTotal: number;
  currency: string;
  // tiny thumbnail array for the list row (first image of first 3 products)
  thumbnails: Array<{ url: string; alt: string }>;
};

export type MyOrderDetail = {
  id: string;
  publicNumber: string;
  status: string;
  paymentStatus: string;
  placedAt: Date;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  trackingUrl: string | null;
  trackingNumber: string | null;
  invoiceUrl: string | null;
  couponCode: string | null;
  notes: string | null;
  shippingAddress: FormattedAddress | null;
  billingAddress: FormattedAddress | null;
  items: Array<{
    id: string;
    productId: string;
    nameSnapshot: string;
    skuSnapshot: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    thumbnailUrl: string | null;
    slug: string | null;
  }>;
};

export type FormattedAddress = {
  firstName: string;
  lastName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  region: string | null;
  country: string;
  phone: string | null;
};

/**
 * List all orders placed by this user, newest first.
 * Keeps it skinny — each row only needs enough for a summary card.
 */
/**
 * Aggregate stats for the account overview "at a glance" strip.
 * Cheap — one aggregate query + one count — and intentionally narrow so we
 * don't tempt anyone into using this for dashboards that need more detail.
 */
export type MyAccountGlance = {
  orderCount: number;
  lifetimeSpendEur: number;
  wishlistCount: number;
  memberSince: Date | null;
};

export async function getMyAccountGlance(
  userId: string,
): Promise<MyAccountGlance> {
  const [orderAgg, wishlistCount, user] = await Promise.all([
    prisma.order.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { grandTotal: true },
    }),
    prisma.wishlistItem.count({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    }),
  ]);

  return {
    orderCount: orderAgg._count._all,
    lifetimeSpendEur: orderAgg._sum.grandTotal
      ? Number(orderAgg._sum.grandTotal)
      : 0,
    wishlistCount,
    memberSince: user?.createdAt ?? null,
  };
}

export async function listMyOrders(userId: string): Promise<MyOrderListItem[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { placedAt: "desc" },
    include: {
      items: {
        select: {
          quantity: true,
          product: {
            select: {
              media: {
                where: { isPrimary: true },
                select: { url: true, alt: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  return orders.map((o) => {
    const itemCount = o.items.reduce((n, i) => n + i.quantity, 0);
    const thumbnails = o.items
      .map((i) => i.product.media[0])
      .filter((m): m is { url: string; alt: string | null } => Boolean(m))
      .slice(0, 3)
      .map((m) => ({ url: m.url, alt: m.alt ?? "" }));

    return {
      id: o.id,
      publicNumber: o.publicNumber,
      status: o.status,
      placedAt: o.placedAt,
      itemCount,
      grandTotal: Number(o.grandTotal),
      currency: o.currency,
      thumbnails,
    };
  });
}

/**
 * Get one order by its public number, scoped to the user so one customer
 * can't peek at another customer's order by guessing numbers.
 * Returns null if not found or not owned by this user.
 */
export async function getMyOrderByNumber(
  userId: string,
  publicNumber: string,
  urlLocale: string,
): Promise<MyOrderDetail | null> {
  const order = await prisma.order.findFirst({
    where: { userId, publicNumber },
    include: {
      shippingAddress: true,
      billingAddress: true,
      items: {
        orderBy: { lineTotal: "desc" },
        include: {
          product: {
            include: {
              media: {
                where: { isPrimary: true },
                select: { url: true },
                take: 1,
              },
              translations: {
                select: { locale: true, slug: true },
              },
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  // Best-effort slug in the user's locale, fallback to EN.
  const prismaLocale = urlLocale.toUpperCase();

  return {
    id: order.id,
    publicNumber: order.publicNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    placedAt: order.placedAt,
    paidAt: order.paidAt,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    discountTotal: Number(order.discountTotal),
    shippingTotal: Number(order.shippingTotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    trackingUrl: order.trackingUrl,
    trackingNumber: order.trackingNumber,
    invoiceUrl: order.invoiceUrl,
    couponCode: order.couponCode,
    notes: order.notes,
    shippingAddress: order.shippingAddress
      ? addressToFormatted(order.shippingAddress)
      : null,
    billingAddress: order.billingAddress
      ? addressToFormatted(order.billingAddress)
      : null,
    items: order.items.map((item) => {
      const ts = item.product.translations;
      const localised =
        ts.find((t) => t.locale === prismaLocale) ??
        ts.find((t) => t.locale === "EN");
      return {
        id: item.id,
        productId: item.productId,
        nameSnapshot: item.nameSnapshot,
        skuSnapshot: item.skuSnapshot,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
        thumbnailUrl: item.product.media[0]?.url ?? null,
        slug: localised?.slug ?? null,
      };
    }),
  };
}

function addressToFormatted(a: {
  firstName: string;
  lastName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  region: string | null;
  country: string;
  phone: string | null;
}): FormattedAddress {
  return {
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    postcode: a.postcode,
    region: a.region,
    country: a.country,
    phone: a.phone,
  };
}
