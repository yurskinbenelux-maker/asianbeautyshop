// ─────────────────────────────────────────────────────────────────────────
// Admin sidebar badge counts.
//
// Two red-dot badges drive admin's attention on a fresh page load:
//   · "Orders" link  — paid orders waiting to ship (PAID or FULFILLING).
//                       Drops off the count the moment admin marks it
//                       SHIPPED.
//   · "Returns" link — returns still owed money (any status except
//                       REFUNDED, REJECTED, CANCELLED). Drops off the
//                       count when admin marks REFUNDED.
//
// Called from `app/admin/layout.tsx` on every admin route change. Both
// counts are indexed scans (`Order.status`, `ReturnRequest.status` both
// have indexes), so this stays cheap even if volumes climb.
//
// Returns 0 on Prisma errors rather than throwing — the badge is UX
// polish, not access control, and a DB hiccup must never lock admin
// out of the panel.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

export type AdminBadgeCounts = {
  ordersAwaitingShipment: number;
  returnsAwaitingRefund: number;
};

/**
 * Pull both counts in parallel. Logs + returns 0s on failure.
 *
 * Filter rationale:
 *   · Orders: PAID and FULFILLING are the "money's in, parcel hasn't
 *     left yet" states. SHIPPED, DELIVERED, CANCELLED, REFUNDED,
 *     PARTIALLY_REFUNDED, PENDING are all out of scope.
 *       - PENDING means payment hasn't cleared yet — no action for
 *         admin yet, customer's problem.
 *       - PARTIALLY_REFUNDED means the order was fulfilled and partly
 *         returned; not in the "needs shipping" bucket.
 *   · Returns: REQUESTED, APPROVED, RECEIVED all need admin attention
 *     before money goes back. REFUNDED is the terminal happy state;
 *     REJECTED and CANCELLED are dead ends — none belong on the count.
 */
export async function getAdminBadgeCounts(): Promise<AdminBadgeCounts> {
  try {
    const [orders, returns] = await Promise.all([
      prisma.order.count({
        where: { status: { in: ["PAID", "FULFILLING"] } },
      }),
      prisma.returnRequest.count({
        where: { status: { in: ["REQUESTED", "APPROVED", "RECEIVED"] } },
      }),
    ]);
    return { ordersAwaitingShipment: orders, returnsAwaitingRefund: returns };
  } catch (err) {
    console.error("[admin/badge-counts] count failed", err);
    return { ordersAwaitingShipment: 0, returnsAwaitingRefund: 0 };
  }
}
