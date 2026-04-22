// ─────────────────────────────────────────────────────────────────────────
// Admin coupons — read queries.
//
// Keeps Prisma access out of page components so the admin pages stay
// declarative. The `summary` shape matches the list row; `detail` matches
// the edit page (coupon + a preview of recent orders that used it).
//
// `getCouponAnalytics` derives performance numbers (redemptions, revenue,
// top products) from actual Order rows — not the Coupon.redemptionsUsed
// counter — so cancelled orders don't inflate the picture Sofia sees.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";

export type CouponSummary = {
  code: string;
  kind: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number; // percent (0-100) or cents (fixed), 0 for free-shipping
  minSubtotalCents: number | null;
  maxRedemptions: number | null;
  redemptionsUsed: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  firstOrderOnly: boolean;
  createdAt: Date;
};

export type CouponDetail = CouponSummary & {
  recentOrders: {
    id: string;
    publicNumber: string;
    placedAt: Date;
    grandTotalCents: number;
    status: string;
  }[];
};

const PAGE_SIZE = 50;

/** List coupons, newest first. Simple enough that pagination is optional. */
export async function listAdminCoupons(
  page = 1,
): Promise<{ rows: CouponSummary[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.coupon.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.coupon.count(),
  ]);

  return {
    rows: rows.map(toSummary),
    total,
  };
}

/** Fetch a single coupon + a few recent orders. Returns null if missing. */
export async function getAdminCoupon(code: string): Promise<CouponDetail | null> {
  const coupon = await prisma.coupon.findUnique({
    where: { code },
    include: {
      orders: {
        orderBy: { placedAt: "desc" },
        take: 8,
        select: {
          id: true,
          publicNumber: true,
          placedAt: true,
          grandTotal: true,
          status: true,
        },
      },
    },
  });
  if (!coupon) return null;

  return {
    ...toSummary(coupon),
    recentOrders: coupon.orders.map((o) => ({
      id: o.id,
      publicNumber: o.publicNumber,
      placedAt: o.placedAt,
      grandTotalCents: Math.round(Number(o.grandTotal) * 100),
      status: o.status,
    })),
  };
}

// ──────── analytics ─────────────────────────────────────────────────────

export type CouponAnalytics = {
  /** Count of non-cancelled orders that used the code. */
  redemptionsCount: number;
  /** Sum of grandTotal across non-cancelled orders, in cents. */
  attributedRevenueCents: number;
  /** Sum of order-level discountTotal across non-cancelled orders, in cents. */
  discountGivenCents: number;
  /** attributedRevenueCents / redemptionsCount (0 if no redemptions). */
  averageOrderCents: number;
  /** Most recent placedAt across orders using this code; null if unused. */
  lastUsedAt: Date | null;
  /** Top five products (by total quantity) that appeared in orders using this code. */
  topProducts: {
    productId: string;
    name: string;
    quantity: number;
    revenueCents: number;
  }[];
};

/**
 * Derive performance analytics for a single coupon from its attached orders.
 *
 * Why not rely on Coupon.redemptionsUsed? Because that counter increments at
 * checkout and never decrements on cancellation — it's fine as a soft usage
 * cap but misleads as a "how well is this promo doing?" signal. This query
 * computes the truthful numbers from the Order table instead.
 *
 * Cancelled orders are excluded from all aggregates. Refunded / partially-
 * refunded orders are *included* — the customer still got the discount,
 * and cutting those out would underreport real coupon pull.
 */
export async function getCouponAnalytics(
  code: string,
): Promise<CouponAnalytics> {
  // Step 1 — pull the candidate orders (non-cancelled) in one round trip.
  // We only need a handful of fields: id for the OrderItem join, placedAt
  // for last-used, and the two money columns to aggregate in JS.
  const orders = await prisma.order.findMany({
    where: {
      couponCode: code,
      status: { not: OrderStatus.CANCELLED },
    },
    select: {
      id: true,
      grandTotal: true,
      discountTotal: true,
      placedAt: true,
    },
    orderBy: { placedAt: "desc" },
  });

  const redemptionsCount = orders.length;
  const attributedRevenueCents = orders.reduce(
    (acc, o) => acc + Math.round(Number(o.grandTotal) * 100),
    0,
  );
  const discountGivenCents = orders.reduce(
    (acc, o) => acc + Math.round(Number(o.discountTotal) * 100),
    0,
  );
  const averageOrderCents = redemptionsCount
    ? Math.round(attributedRevenueCents / redemptionsCount)
    : 0;
  const lastUsedAt = orders[0]?.placedAt ?? null;

  // Step 2 — top five products redeemed with this code.
  // Guard against the "no redemptions yet" case because groupBy on an
  // empty `in: []` filter is still a query we can skip.
  let topProducts: CouponAnalytics["topProducts"] = [];
  if (orders.length > 0) {
    const orderIds = orders.map((o) => o.id);

    // Group by productId only — grouping by nameSnapshot would split
    // the same product into multiple rows if Sofia ever renamed it.
    const grouped = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: { orderId: { in: orderIds } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    });

    // Pull a representative name for each product. We use the most
    // recent snapshot from these exact orders (via `distinct` on
    // productId + desc id) so the label reflects what the customer saw.
    const productIds = grouped.map((g) => g.productId);
    const nameRows =
      productIds.length === 0
        ? []
        : await prisma.orderItem.findMany({
            where: {
              orderId: { in: orderIds },
              productId: { in: productIds },
            },
            select: { productId: true, nameSnapshot: true },
            distinct: ["productId"],
            orderBy: { id: "desc" },
          });
    const nameByProduct = new Map(
      nameRows.map((r) => [r.productId, r.nameSnapshot]),
    );

    topProducts = grouped.map((g) => ({
      productId: g.productId,
      name: nameByProduct.get(g.productId) ?? "(unnamed)",
      quantity: g._sum.quantity ?? 0,
      revenueCents: Math.round(Number(g._sum.lineTotal ?? 0) * 100),
    }));
  }

  return {
    redemptionsCount,
    attributedRevenueCents,
    discountGivenCents,
    averageOrderCents,
    lastUsedAt,
    topProducts,
  };
}

// ──────── internal ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSummary(c: any): CouponSummary {
  return {
    code: c.code,
    kind: c.kind,
    // value is stored as Decimal in the DB: for PERCENT it's a percent,
    // for FIXED it's euros (not cents). We normalise on read — fixed ->
    // cents so the UI can format consistently.
    value:
      c.kind === "FIXED"
        ? Math.round(Number(c.value) * 100)
        : Number(c.value),
    minSubtotalCents:
      c.minSubtotal == null ? null : Math.round(Number(c.minSubtotal) * 100),
    maxRedemptions: c.maxRedemptions,
    redemptionsUsed: c.redemptionsUsed,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    isActive: c.isActive,
    firstOrderOnly: c.firstOrderOnly,
    createdAt: c.createdAt,
  };
}
