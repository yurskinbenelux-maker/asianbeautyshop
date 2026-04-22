// ─────────────────────────────────────────────────────────────────────────
// Admin analytics queries.
//
// Everything here is "last 30 days" only. Sofia doesn't need a BI tool —
// she needs a calm glance at: how much did we sell, how many orders, what's
// selling, what's stuck in the fulfilment queue.
//
// Revenue uses Order.grandTotal (Decimal) and is expressed in CENTS on the
// way out so the UI formatter can divide by 100 like the rest of the admin.
// We only count PAID+ states (PAID, FULFILLING, SHIPPED, DELIVERED,
// PARTIALLY_REFUNDED) — PENDING never became money, CANCELLED/REFUNDED
// don't belong in top-line revenue.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";

/** Orders in these states count toward revenue. */
const REVENUE_STATES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.FULFILLING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.PARTIALLY_REFUNDED,
];

/** Orders that are actionable (need Sofia to do something). */
const ACTIVE_STATES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.FULFILLING,
  OrderStatus.SHIPPED,
];

export type DailyRevenuePoint = {
  date: string; // YYYY-MM-DD (UTC)
  revenueCents: number;
  orderCount: number;
};

export type StatusSlice = {
  status: OrderStatus;
  count: number;
};

export type TopSeller = {
  productId: string;
  name: string;
  slug: string | null;
  units: number;
  revenueCents: number;
};

export type AnalyticsSummary = {
  /** 30d window — inclusive of today. */
  windowStart: Date;
  windowEnd: Date;
  revenueCents: number;
  orderCount: number;
  /** Average order value, cents. Zero if orderCount === 0. */
  aovCents: number;
  /** One row per day, oldest → newest. Empty days are filled with zeros. */
  daily: DailyRevenuePoint[];
  /** Status breakdown across ALL time (not just window), so Sofia sees what's stuck. */
  statusBreakdown: StatusSlice[];
  /** Top 5 sellers in the window by units sold. */
  topSellers: TopSeller[];
  /** Orders waiting for Sofia's attention right now. */
  activeOrdersCount: number;
  /** Pending reviews across all time. */
  pendingReviewsCount: number;
};

/** UTC midnight of `days` days before today. */
function utcMidnightNDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/** YYYY-MM-DD in UTC. */
function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getAdminAnalytics(): Promise<AnalyticsSummary> {
  const windowEnd = new Date();
  // 29 days ago + today = 30-day window, inclusive.
  const windowStart = utcMidnightNDaysAgo(29);

  const [windowOrders, statusBreakdownRaw, topItemsRaw, activeOrdersCount, pendingReviewsCount] =
    await Promise.all([
      prisma.order.findMany({
        where: {
          status: { in: REVENUE_STATES },
          placedAt: { gte: windowStart },
        },
        select: {
          id: true,
          grandTotal: true,
          placedAt: true,
        },
      }),
      prisma.order.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      // Top products in the window by units.
      prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: {
            status: { in: REVENUE_STATES },
            placedAt: { gte: windowStart },
          },
        },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
      prisma.order.count({ where: { status: { in: ACTIVE_STATES } } }),
      prisma.review.count({ where: { isPublished: false } }),
    ]);

  // Revenue totals.
  const revenueCents = windowOrders.reduce(
    (acc, o) => acc + decimalToCents(o.grandTotal),
    0,
  );
  const orderCount = windowOrders.length;
  const aovCents = orderCount === 0 ? 0 : Math.round(revenueCents / orderCount);

  // Bucket orders into days — skeleton first, so empty days still render.
  const daily: DailyRevenuePoint[] = [];
  const byDate = new Map<string, DailyRevenuePoint>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(windowStart);
    d.setUTCDate(windowStart.getUTCDate() + i);
    const key = ymdUtc(d);
    const point: DailyRevenuePoint = {
      date: key,
      revenueCents: 0,
      orderCount: 0,
    };
    daily.push(point);
    byDate.set(key, point);
  }
  for (const o of windowOrders) {
    const key = ymdUtc(o.placedAt);
    const bucket = byDate.get(key);
    if (bucket) {
      bucket.revenueCents += decimalToCents(o.grandTotal);
      bucket.orderCount += 1;
    }
  }

  const statusBreakdown: StatusSlice[] = statusBreakdownRaw
    .map((row) => ({ status: row.status, count: row._count._all }))
    .sort((a, b) => b.count - a.count);

  // Enrich top sellers with the English name + slug.
  const productIds = topItemsRaw.map((r) => r.productId);
  const translations =
    productIds.length === 0
      ? []
      : await prisma.productTranslation.findMany({
          where: { productId: { in: productIds }, locale: "EN" },
          select: { productId: true, name: true, slug: true },
        });
  const nameByProductId = new Map(
    translations.map((t) => [t.productId, { name: t.name, slug: t.slug }]),
  );
  const topSellers: TopSeller[] = topItemsRaw.map((r) => {
    const meta = nameByProductId.get(r.productId);
    const units = r._sum?.quantity ?? 0;
    const lineTotal = r._sum?.lineTotal;
    return {
      productId: r.productId,
      name: meta?.name ?? "(untitled)",
      slug: meta?.slug ?? null,
      units,
      revenueCents: lineTotal ? decimalToCents(lineTotal) : 0,
    };
  });

  return {
    windowStart,
    windowEnd,
    revenueCents,
    orderCount,
    aovCents,
    daily,
    statusBreakdown,
    topSellers,
    activeOrdersCount,
    pendingReviewsCount,
  };
}

// Prisma returns Decimal, which is a heavy object. We only ever need cents.
function decimalToCents(v: unknown): number {
  if (v == null) return 0;
  // Prisma.Decimal has a .toNumber() method. For safety, also handle plain
  // numbers + strings (e.g., during tests).
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? parseFloat(v)
      : typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
