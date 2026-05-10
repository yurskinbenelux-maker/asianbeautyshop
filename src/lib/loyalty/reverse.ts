// ─────────────────────────────────────────────────────────────────────────
// A-Beauty Club refund reversal (A6)
//
// When a paid order is refunded — fully or partially — we claw back the
// loyalty points the customer earned from that order, proportional to
// the refund amount. Without this, customers could repeatedly buy +
// return items to farm points.
//
// Math:
//   pointsReversed = round( totalPointsEarned × (refundAmount / orderGrandTotal) )
//
// Where totalPointsEarned is the sum of EARNED_ORDER + EARNED_MILESTONE
// rows for this orderId (other earning paths — birthday, task, referral
// — aren't tied to the order, so they're untouched).
//
// Idempotency:
//   Scoped per (orderId, returnId, kind=REVERSED_REFUND). One order can
//   have multiple returns and each gets its own reversal; we won't double-
//   reverse the same return because we look it up before posting.
//
// Guest checkouts (no userId) silently no-op — no LoyaltyAccount, no
// points to reverse.
//
// Wired into src/lib/credit-notes/issue.ts:issueRefundAndCreditNote as a
// best-effort post-write step. A failure here logs but doesn't roll back
// the refund or the credit note — the legal record stands; loyalty is a
// secondary concern that admin can patch by hand if it ever drifts.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { LoyaltyEventKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyLoyaltyEvent } from "./account";

export type ReverseLoyaltyInput = {
  orderId: string;
  returnId: string;
  /** VAT-inclusive refund amount in EUR — the customer-facing total. */
  refundAmount: number;
  /** Order grand total in EUR — used to compute the proportion. */
  orderGrandTotal: number;
};

export type ReverseLoyaltyResult = {
  reversed: number;        // points subtracted (always negative when applied)
  skipped: boolean;
  reason?:
    | "guest-order"
    | "no-points-to-reverse"
    | "already-reversed"
    | "rounded-to-zero"
    | "program-paused";
};

/**
 * Issue a REVERSED_REFUND loyalty event proportional to the refunded
 * fraction of an order. Best-effort, never throws into the caller — a
 * loyalty hiccup must not roll back a real-money refund.
 */
export async function reverseLoyaltyOnRefund(
  input: ReverseLoyaltyInput,
): Promise<ReverseLoyaltyResult> {
  // ── 1. Find the customer's loyalty account via the order's userId ──
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { userId: true, publicNumber: true },
  });
  if (!order || !order.userId) {
    // Guest checkout — no account, nothing to reverse.
    return { reversed: 0, skipped: true, reason: "guest-order" };
  }

  // ── 2. Idempotency: did we already reverse for THIS specific return? ─
  // Scope by (orderId, returnId) — one order can have multiple returns.
  const alreadyReversed = await prisma.loyaltyEvent.findFirst({
    where: {
      orderId: input.orderId,
      returnId: input.returnId,
      kind: LoyaltyEventKind.REVERSED_REFUND,
    },
    select: { id: true },
  });
  if (alreadyReversed) {
    return { reversed: 0, skipped: true, reason: "already-reversed" };
  }

  // ── 3. Sum points earned from this order ────────────────────────────
  // Order-tied earning paths only — birthday / task / referral aren't
  // tied to a sale and shouldn't be clawed back when the sale is refunded.
  const earned = await prisma.loyaltyEvent.aggregate({
    where: {
      orderId: input.orderId,
      kind: {
        in: [
          LoyaltyEventKind.EARNED_ORDER,
          LoyaltyEventKind.EARNED_MILESTONE,
        ],
      },
    },
    _sum: { delta: true },
  });
  const totalEarned = earned._sum.delta ?? 0;
  if (totalEarned <= 0) {
    return { reversed: 0, skipped: true, reason: "no-points-to-reverse" };
  }

  // ── 4. Proportional clawback ─────────────────────────────────────────
  // Guard against divide-by-zero if grandTotal is 0 (free orders shouldn't
  // be hitting this path — they have no Mollie refund — but be defensive).
  if (input.orderGrandTotal <= 0) {
    return { reversed: 0, skipped: true, reason: "no-points-to-reverse" };
  }
  const fraction = Math.min(1, input.refundAmount / input.orderGrandTotal);
  const pointsToReverse = Math.round(totalEarned * fraction);
  if (pointsToReverse <= 0) {
    return { reversed: 0, skipped: true, reason: "rounded-to-zero" };
  }

  // ── 5. Post the negative event ──────────────────────────────────────
  // applyLoyaltyEvent handles the atomic balance update + event row.
  // pointsLifetime is NOT decremented (it's the "earned ever" odometer
  // and the customer DID earn those points — they just had it taken
  // back); applyLoyaltyEvent already encodes that rule (lifetimeDelta
  // is 0 for negative deltas).
  await applyLoyaltyEvent({
    userId: order.userId,
    kind: LoyaltyEventKind.REVERSED_REFUND,
    delta: -pointsToReverse,
    reason: `Refund clawback — order ${order.publicNumber} (${Math.round(fraction * 100)}%)`,
    orderId: input.orderId,
    returnId: input.returnId,
  });

  return { reversed: pointsToReverse, skipped: false };
}
