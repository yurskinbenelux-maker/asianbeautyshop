// ─────────────────────────────────────────────────────────────────────────
// Replenishment-reminder eligibility query.
//
// An order is eligible for the "running out?" email when:
//   • status = DELIVERED
//   • deliveredAt is between MIN_DAYS and MAX_DAYS ago
//     (default 45–90 days — covers a typical cleanser / serum / cream
//      consumption cycle without nagging customers who buy in bulk)
//   • the order has a userId (we don't know how to reach a guest 45
//     days later — guest emails were captured but tying back to "have
//     they bought again?" is hard without a userId)
//   • no OrderEvent kind="replenishment.sent" exists for this order
//   • the user hasn't placed a NEWER paid order — if they already
//     reordered, they don't need a reminder for this one
//
// Keeps batches bounded so a backlog can't tie up the cron.
// ─────────────────────────────────────────────────────────────────────────

import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const REPLENISH_MIN_DAYS = 45;
export const REPLENISH_MAX_DAYS = 90;
export const REPLENISH_BATCH_SIZE = 50;
export const REPLENISH_EVENT_KIND = "replenishment.sent";

export type ReplenishmentCandidate = {
  id: string;
  publicNumber: string;
};

function daysAgo(d: number): Date {
  const t = new Date();
  t.setDate(t.getDate() - d);
  return t;
}

export async function findOrdersDueForReplenishment(
  batchSize: number = REPLENISH_BATCH_SIZE,
): Promise<ReplenishmentCandidate[]> {
  const cutoffOldest = daysAgo(REPLENISH_MAX_DAYS);
  const cutoffYoungest = daysAgo(REPLENISH_MIN_DAYS);

  const rows = await prisma.order.findMany({
    where: {
      status: OrderStatus.DELIVERED,
      userId: { not: null },
      deliveredAt: { gte: cutoffOldest, lte: cutoffYoungest, not: null },
      // Already reminded → skip.
      events: { none: { kind: REPLENISH_EVENT_KIND } },
      // No newer paid order from the same user → skip if they already
      // bought again. We use a relation filter on User.orders to avoid
      // a separate round-trip per candidate.
      user: {
        orders: {
          none: {
            // "newer paid order than this one" — relation filter expressed
            // via a where on the related User.orders. The status check
            // covers PAID, FULFILLING, SHIPPED, DELIVERED — anything
            // post-payment counts as "they bought again".
            status: { in: [
              OrderStatus.PAID,
              OrderStatus.FULFILLING,
              OrderStatus.SHIPPED,
              OrderStatus.DELIVERED,
            ] },
            placedAt: { gt: cutoffYoungest },
          } satisfies Prisma.OrderWhereInput,
        },
      },
    },
    orderBy: { deliveredAt: "asc" },
    take: batchSize,
    select: { id: true, publicNumber: true },
  });
  return rows;
}

export async function markReplenishmentSent(
  orderId: string,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.orderEvent.create({
    data: { orderId, kind: REPLENISH_EVENT_KIND, metadata },
  });
}
