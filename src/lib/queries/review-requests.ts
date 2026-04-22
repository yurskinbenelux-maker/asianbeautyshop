// ─────────────────────────────────────────────────────────────────────────
// Review-request eligibility query.
//
// An order is eligible for the "how did it go?" email when:
//   • status = DELIVERED
//   • deliveredAt is ≥ REVIEW_REQUEST_DELAY_DAYS ago
//   • no OrderEvent with kind="review-request.sent" exists for this order
//
// We rely on OrderEvent rather than adding a dedicated column so we can
// ship without a schema change. Once the cron sends the email, it writes
// the event row, which becomes the "done" flag.
//
// Returns a bounded batch (default 50) so a big backlog doesn't tie up
// the cron for minutes. The cron runs daily, so catching up happens
// naturally over a few runs.
// ─────────────────────────────────────────────────────────────────────────

import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const REVIEW_REQUEST_DELAY_DAYS = 14;
export const REVIEW_REQUEST_BATCH_SIZE = 50;
export const REVIEW_REQUEST_EVENT_KIND = "review-request.sent";

export type ReviewRequestCandidate = {
  id: string;
  publicNumber: string;
};

/**
 * Find orders eligible for a review-request email. Returns up to
 * `batchSize` rows. Only IDs + publicNumbers — the actual email rendering
 * pulls the full order via getOrderForEmail.
 */
export async function findOrdersDueForReviewRequest(
  batchSize: number = REVIEW_REQUEST_BATCH_SIZE,
): Promise<ReviewRequestCandidate[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REVIEW_REQUEST_DELAY_DAYS);

  const rows = await prisma.order.findMany({
    where: {
      status: OrderStatus.DELIVERED,
      deliveredAt: { lte: cutoff, not: null },
      // Exclude orders that already have a "review-request.sent" event.
      events: {
        none: { kind: REVIEW_REQUEST_EVENT_KIND },
      },
    },
    select: { id: true, publicNumber: true },
    orderBy: { deliveredAt: "asc" },
    take: batchSize,
  });
  return rows;
}

/**
 * Record that we've sent the review-request email. Writes an OrderEvent
 * row so the eligibility query won't re-select this order.
 *
 * Separate from the email send so callers can decide: write the event
 * only on successful send (avoid re-sending if Resend is down), or
 * always write it (stop trying for this order regardless).
 *
 * We go with "only on successful send" — see cron route.
 */
export async function markReviewRequestSent(
  orderId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.orderEvent.create({
    data: {
      orderId,
      kind: REVIEW_REQUEST_EVENT_KIND,
      metadata: metadata ?? undefined,
    },
  });
}
