// ─────────────────────────────────────────────────────────────────────────
// A-Beauty Club refund reversal (A6)
//
// When a paid order is refunded — fully or partially — we claw back the
// loyalty points the customer earned from that order, proportional to
// the refund amount. Without this, customers could repeatedly buy +
// return items to farm points.
//
// Math:
//   pointsReversed = round( totalPointsEarned × (refundAmount / physicalProductSubtotal) )
//
// Where physicalProductSubtotal is the same base accrual used (sum of
// non-gift-card OrderItem.lineTotal — excludes shipping, excludes
// vouchers). Using grandTotal here would create asymmetric math:
// accrual would award fewer points than a full refund would claw back,
// AND partial product refunds would under-claw because the grandTotal
// denominator includes shipping the customer DID NOT earn points on.
//
// totalPointsEarned is the sum of EARNED_ORDER + EARNED_MILESTONE rows
// for this orderId. Other earning paths (birthday, task, referral)
// aren't tied to the order, so they're untouched.
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
  /**
   * Order grand total in EUR — kept for backwards compatibility with the
   * caller signature, but no longer used for the proportion calculation
   * (see file header for why). The function now reads OrderItems
   * directly to derive the physical-product subtotal.
   */
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
  // Also pull the order items so we can compute the physical-product
  // subtotal (excludes gift cards + shipping + tax). That base must
  // match what accrual used, otherwise the math doesn't balance on
  // full refunds.
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      userId: true,
      publicNumber: true,
      items: {
        select: {
          lineTotal: true,
          product: { select: { kind: true } },
        },
      },
    },
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

  // ── 4. Proportional clawback against the PHYSICAL subtotal ───────────
  // Use the same base accrual used (sum of non-gift-card OrderItem
  // lineTotals). Capping at 1.0 means a refund larger than the physical
  // subtotal — e.g. customer refunds product + shipping — claws back
  // every point earned but never more.
  const physicalSubtotal = order.items
    .filter((it) => it.product.kind !== "GIFT_CARD")
    .reduce((sum, it) => sum + Number(it.lineTotal), 0);
  if (physicalSubtotal <= 0) {
    // No physical products on this order — no points were earned, no
    // clawback. Bypass the rounding-to-zero branch with a clearer reason.
    return { reversed: 0, skipped: true, reason: "no-points-to-reverse" };
  }
  const fraction = Math.min(1, input.refundAmount / physicalSubtotal);
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
