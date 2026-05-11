// ─────────────────────────────────────────────────────────────────────────
// syncMolliePayment — reconcile our Order row with Mollie's payment state.
//
// Called from two places:
//   1. /api/webhooks/mollie — the normal path in production. Mollie POSTs
//      us an id, we re-fetch the payment (never trust the webhook body),
//      and call this.
//   2. /checkout/success and /checkout/failure — the return-URL fallback.
//      Useful on localhost (no public webhook URL possible) and as a
//      belt-and-braces for when a webhook is delayed.
//
// Idempotent. Safe to call multiple times for the same payment — we only
// mutate the Order + fire emails on an actual state transition, never on
// a no-op re-sync.
// ─────────────────────────────────────────────────────────────────────────

import { Prisma, OrderStatus, PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getMollie, isPaidStatus } from "@/lib/mollie/client";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { issueInvoiceForOrder } from "@/lib/invoices/issue";
import { sendAdminNewOrderEmail } from "@/lib/email/admin-new-order";
import { applyMovement } from "@/lib/inventory/movements";
import { syncOrderToSendcloud } from "@/lib/sendcloud/sync";
import { issueGiftCardsForOrder } from "@/lib/gift-cards/issue-from-order";
import { applyGiftCardToOrder } from "@/lib/gift-cards/db";

// ────────── types ───────────────────────────────────────────────────────

export type SyncResult =
  | {
      ok: true;
      orderId: string;
      publicNumber: string;
      mollieStatus: string;
      paymentStatus: PaymentStatus;
      orderStatus: OrderStatus;
      /** True if this call actually transitioned the order (useful for tests). */
      changed: boolean;
      /** True if this call was the transition that flipped to PAID. */
      paidTransition: boolean;
    }
  | {
      ok: false;
      reason:
        | "order-not-found"
        | "no-mollie-id"
        | "mollie-fetch-failed"
        | "mollie-not-configured";
    };

// ────────── main entry points ───────────────────────────────────────────

/** Sync by our public order number (used on return URLs). */
export async function syncByPublicNumber(
  publicNumber: string,
): Promise<SyncResult> {
  const order = await prisma.order.findUnique({
    where: { publicNumber },
    select: orderSelect,
  });
  if (!order) return { ok: false, reason: "order-not-found" };
  return syncOrderWithMollie(order);
}

/** Sync by Mollie payment id (used from the webhook). */
export async function syncByMollieId(mollieId: string): Promise<SyncResult> {
  const order = await prisma.order.findFirst({
    where: { mollieId },
    select: orderSelect,
  });
  if (!order) return { ok: false, reason: "order-not-found" };
  return syncOrderWithMollie(order);
}

// ────────── core ────────────────────────────────────────────────────────

const orderSelect = {
  id: true,
  publicNumber: true,
  mollieId: true,
  status: true,
  paymentStatus: true,
  paidAt: true,
  grandTotal: true,
  // Needed on the PAID transition to detect quiz-reward orders and
  // mark the user's QuizCompletion as redeemed (rule A enforcement).
  couponCode: true,
  // A-Beauty Club accrual on the PAID transition needs the customer + the
  // subtotal (we award on subtotal not grandTotal so shipping/tax don't
  // earn points). The user relation is optional because guest checkouts
  // don't earn loyalty points — anonymous orders have no account to
  // credit and signing up later doesn't retroactively claim past orders.
  subtotal: true,
  userId: true,
  user: { select: { firstName: true } },
} satisfies Prisma.OrderSelect;

type OrderForSync = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

async function syncOrderWithMollie(order: OrderForSync): Promise<SyncResult> {
  if (!order.mollieId) {
    return { ok: false, reason: "no-mollie-id" };
  }
  if (!process.env.MOLLIE_API_KEY) {
    return { ok: false, reason: "mollie-not-configured" };
  }

  const mollie = getMollie();
  let payment;
  try {
    payment = await mollie.payments.get(order.mollieId);
  } catch (err) {
    console.error("[syncMollie] mollie.payments.get failed", err);
    return { ok: false, reason: "mollie-fetch-failed" };
  }

  const nextPayment = mapMollieToPaymentStatus(payment.status);
  const nextOrder = deriveOrderStatus(order.status, nextPayment);

  // No-op if nothing would change — we deliberately avoid writing so the
  // updatedAt timestamp stays meaningful.
  const paymentUnchanged = nextPayment === order.paymentStatus;
  const orderUnchanged = nextOrder === order.status;
  if (paymentUnchanged && orderUnchanged) {
    return {
      ok: true,
      orderId: order.id,
      publicNumber: order.publicNumber,
      mollieStatus: payment.status,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      changed: false,
      paidTransition: false,
    };
  }

  const now = new Date();
  // `intendsToFlipToPaid` is what we INTEND based on the read we just
  // did. It tells us whether to bother pre-fetching line items + entering
  // the "winner-only" branch below. It is NOT the gate for the post-paid
  // fan-out — that gate is `iAmTheWinner`, set atomically inside the tx.
  // Two webhooks racing both compute intendsToFlipToPaid=true; only one
  // wins the conditional UPDATE; only the winner does the fan-out.
  const intendsToFlipToPaid =
    order.paymentStatus !== PaymentStatus.PAID &&
    nextPayment === PaymentStatus.PAID;

  // Pre-fetch line items so the in-tx inventory move has them ready. We
  // only need this when we INTEND to flip — for any other transition we
  // skip the query. Product.kind comes along so GIFT_CARD lines are
  // excluded from the stock churn.
  let paidItems: Array<{
    variantId: string | null;
    quantity: number;
    productKind: "STANDARD" | "GIFT_CARD";
  }> = [];
  if (intendsToFlipToPaid) {
    const rows = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: {
        variantId: true,
        quantity: true,
        product: { select: { kind: true } },
      },
    });
    paidItems = rows.map((r) => ({
      variantId: r.variantId,
      quantity: r.quantity,
      productKind: r.product.kind === "GIFT_CARD" ? "GIFT_CARD" : "STANDARD",
    }));
  }

  // ── H6 atomic flip ─────────────────────────────────────────────────
  // Set on every code path inside the transaction:
  //   · intendsToFlipToPaid && winner → fan out below.
  //   · intendsToFlipToPaid && lost   → another concurrent caller already
  //     flipped this order; skip the fan-out. Their post-paid pipeline
  //     handles invoice + Sendcloud + emails for us.
  //   · !intendsToFlipToPaid          → no fan-out attempted regardless.
  //
  // Two production code paths race here every paid order:
  //   1. /api/webhooks/mollie  — Mollie's POST when payment clears.
  //   2. /checkout/success     — the customer's browser return URL.
  // Pre-H6 both saw paymentStatus=PENDING (read before the tx), both
  // computed willFlipToPaid=true, both ran the fan-out → duplicate
  // confirmation emails AND duplicate Sendcloud parcels (Invoice
  // creation survived only because of the orderId unique constraint).
  //
  // The fix: stamp `paidAt` with a conditional `updateMany WHERE paidAt
  // IS NULL`. Only one row matches (Postgres serializes the writes), so
  // only one caller gets count===1. That caller is "the winner" and
  // owns the post-paid pipeline.
  let iAmTheWinner = false;
  await prisma.$transaction(async (tx) => {
    if (intendsToFlipToPaid) {
      const { count } = await tx.order.updateMany({
        where: { id: order.id, paidAt: null },
        data: {
          paymentStatus: nextPayment,
          status: nextOrder,
          paidAt: now,
        },
      });
      iAmTheWinner = count === 1;
      if (!iAmTheWinner) {
        // Lost the race. Don't write an OrderEvent — the winner already
        // wrote `payment.paid`. Writing again would double-log and
        // confuse the activity timeline in /admin/orders/[id].
        return;
      }
    } else {
      // Plain non-paid transition (FAILED, OPEN, etc). No race possible
      // because only the into-PAID branch fans out side-effects.
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: nextPayment,
          status: nextOrder,
        },
      });
    }

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        kind: intendsToFlipToPaid
          ? "payment.paid"
          : nextPayment === PaymentStatus.FAILED
            ? "payment.failed"
            : "payment.updated",
        message: `Mollie status → ${payment.status}`,
        metadata: {
          mollieStatus: payment.status,
          paymentStatus: nextPayment,
          orderStatus: nextOrder,
        },
      },
    });

    // Inventory deduction — only on the real into-PAID transition AND
    // only when WE won the flip. A losing concurrent caller skipped past
    // the OrderEvent above and bails before this block. Same tx as the
    // updateMany so a variant FK miss rolls everything back rather than
    // marking the order PAID with phantom stock.
    if (intendsToFlipToPaid && iAmTheWinner) {
      for (const item of paidItems) {
        if (!item.variantId) continue; // products without variants: out of scope
        if (item.productKind === "GIFT_CARD") continue; // digital good, no stock to move
        await applyMovement(tx, {
          variantId: item.variantId,
          delta: -item.quantity,
          reason: "SALE",
          orderId: order.id,
          note: "Sold (Mollie paid)",
        });
      }
    }
  });

  // Emails fire AFTER the transaction commits so a Resend outage can't roll
  // back the payment-state write. The helpers already swallow their own
  // errors, but we additionally wrap in allSettled.
  //
  // Sendcloud parcel creation lives here too — same allSettled guarantee.
  // If the API call fails, the order still flipped to PAID; an admin can
  // retry the parcel creation manually from the admin order page.
  //
  // H6: this gate is `iAmTheWinner` (NOT intendsToFlipToPaid) so a losing
  // concurrent caller never reaches this block. Pre-H6 we'd get two
  // confirmation emails and two Sendcloud parcels on every paid order.
  if (iAmTheWinner) {
    // Quiz reward redemption — if this order was placed with an ABS-QUIZ-…
    // coupon, stamp redeemedAt on the user's QuizCompletion. That
    // permanently disables their cart-restore email link AND blocks any
    // future quiz-reward issuance for the account (rule A enforcement
    // at the application layer; the deterministic coupon code already
    // enforces it at the DB layer). Idempotent.
    if (order.couponCode && order.couponCode.startsWith("ABS-QUIZ-")) {
      try {
        const { markQuizRewardRedeemed } = await import("@/lib/quiz/reward");
        await markQuizRewardRedeemed(prisma, order.couponCode);
      } catch (err) {
        // Non-blocking — payment already cleared. Log and move on; the
        // unique-coupon constraint is the actual security gate, this is
        // just bookkeeping.
        console.error(
          "[sync-mollie] markQuizRewardRedeemed failed",
          order.id,
          err,
        );
      }
    }

    // Drain any gift cards that were applied at checkout. Order of
    // operations matters: drain BEFORE the customer confirmation email
    // so the email reads the post-credit grandTotal correctly. Each call
    // is idempotent on (giftCardId, orderId), so re-running on a webhook
    // retry is a no-op.
    await drainAttachedGiftCards(order.id);

    // A-Beauty Club accrual — points for the order + milestone bonus if this
    // order hit a multiple of LoyaltySettings.milestoneOrders. Both calls
    // are idempotent on the (orderId, kind) pair, so webhook retries are
    // safe. Wrapped in try/catch because a loyalty failure must never
    // roll back a real-money payment.
    if (order.userId) {
      try {
        const subtotalEur = Number(order.subtotal);
        const { accrueOrderPoints, accrueMilestone } = await import(
          "@/lib/loyalty/accrue"
        );
        await accrueOrderPoints({
          orderId: order.id,
          userId: order.userId,
          subtotalEur,
          firstName: order.user?.firstName,
        });
        await accrueMilestone({
          orderId: order.id,
          userId: order.userId,
          firstName: order.user?.firstName,
        });
      } catch (err) {
        console.error("[sync-mollie] loyalty accrual failed", order.id, err);
      }

      // Referral reward — if the customer signed up via a friend's link,
      // their first PAID order pays the referrer their bonus. The helper
      // checks "is this the first paid order" internally; subsequent
      // orders no-op. Email to the referrer fires from inside the helper
      // chain; failures are non-blocking.
      try {
        const { awardReferrerOnFirstOrder } = await import(
          "@/lib/loyalty/referral"
        );
        const result = await awardReferrerOnFirstOrder({
          refereeUserId: order.userId,
          orderId: order.id,
        });
        if (result.awarded) {
          // Fire the "your referral worked" email outside the loyalty
          // tx so a Resend hiccup doesn't roll back the points award.
          const referral = await prisma.referral.findFirst({
            where: { refereeOrderId: order.id },
            include: {
              referrer: {
                select: {
                  email: true,
                  firstName: true,
                  preferredLocale: true,
                },
              },
            },
          });
          if (referral?.referrer) {
            const settings = await (
              await import("@/lib/loyalty/settings")
            ).getLoyaltySettings();
            const { sendReferralRewardedEmail } = await import(
              "@/lib/email/referral-rewarded"
            );
            void sendReferralRewardedEmail({
              email: referral.referrer.email,
              firstName: referral.referrer.firstName,
              locale: referral.referrer.preferredLocale,
              pointsAwarded: settings.referrerBonus,
              refereeEmail: referral.refereeEmail,
            }).catch((err) =>
              console.error("[sync-mollie] referral email failed", err),
            );
          }
        }
      } catch (err) {
        console.error("[sync-mollie] referral reward failed", order.id, err);
      }
    }

    // Issue the VAT invoice BEFORE we fan out the post-paid emails. The
    // confirmation email needs the PDF buffer for its attachment; doing
    // it in series here means we always have it. Other emails
    // (admin-new-order, sendcloud sync, gift-card minting) don't need
    // the PDF and run in parallel below.
    //
    // The helper is idempotent on the (orderId) unique index — webhook
    // retries return the existing invoice instantly, no duplicate row,
    // no duplicate PDF render.
    let invoice: Awaited<ReturnType<typeof issueInvoiceForOrder>> | null = null;
    try {
      invoice = await issueInvoiceForOrder(order.id);
    } catch (err) {
      // A failure here shouldn't roll back the order's PAID state — the
      // payment is real money in the merchant's account. We log + move
      // on; admin can re-issue from /admin/invoices manually if the row
      // is missing.
      //
      // We also write an OrderEvent so the failure surfaces in the
      // admin order detail page's audit log — without this, a silent
      // throw (like the old `Setting."value"` SQL bug) costs us every
      // invoice with zero in-product visibility.
      const message =
        err instanceof Error ? err.message : String(err);
      console.error(
        "[sync-mollie] invoice issue failed",
        order.id,
        err,
      );
      await prisma.orderEvent
        .create({
          data: {
            orderId: order.id,
            kind: "invoice.issue.failed",
            message,
            metadata: {
              error: message,
              stack:
                err instanceof Error && err.stack ? err.stack.slice(0, 2000) : null,
            },
          },
        })
        .catch(() => undefined);
    }

    await Promise.allSettled([
      sendOrderConfirmationEmail(order.id, {
        invoicePdf: invoice
          ? { filename: `${invoice.number}.pdf`, content: invoice.pdfBuffer }
          : undefined,
      }),
      sendAdminNewOrderEmail(order.id),
      syncOrderToSendcloud(order.id),
      // Mint gift cards from any GIFT_CARD line items + send recipient
      // emails. Wrapped in allSettled — a failure here shouldn't roll back
      // the order's PAID state. The helper itself is idempotent so admin
      // can hand-resync the order if a card needs to be re-issued.
      issueGiftCardsForOrder(order.id),
    ]);
  }

  return {
    ok: true,
    orderId: order.id,
    publicNumber: order.publicNumber,
    mollieStatus: payment.status,
    paymentStatus: nextPayment,
    orderStatus: nextOrder,
    changed: !paymentUnchanged || !orderUnchanged,
    // H6: paidTransition is true ONLY for the caller that won the
    // atomic conditional update. Losing concurrent callers return
    // paidTransition=false (their post-paid work was deduped to a
    // no-op by the winner).
    paidTransition: iAmTheWinner,
  };
}

// ────────── gift card draining ─────────────────────────────────────────
//
// On the PAID transition, look up any GiftCard IDs that placeOrder stamped
// on this order via the `giftcard.attached` OrderEvent. For each, decrement
// its balance by the smaller of its remaining balance and the un-drawn
// portion of the order total. Each draw is idempotent on (giftCardId,
// orderId) — webhook retries don't double-spend.
//
// We process in stamp order so the first card the customer applied
// drains first, matching the chip order they saw at checkout.

export async function drainAttachedGiftCards(orderId: string): Promise<void> {
  const event = await prisma.orderEvent.findFirst({
    where: { orderId, kind: "giftcard.attached" },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  if (!event || !event.metadata) return;

  const meta = event.metadata as {
    giftCardIds?: string[];
    preCreditTotalEur?: number;
  };
  const ids = Array.isArray(meta.giftCardIds) ? meta.giftCardIds : [];
  if (ids.length === 0) return;

  // The pre-credit total is what we'd have charged Mollie if no card was
  // applied — that's what each gift card draws against (pricing already
  // capped each draw at min(balance, total)).
  let remainingEur = meta.preCreditTotalEur ?? 0;

  for (const giftCardId of ids) {
    if (remainingEur <= 0) break;
    const result = await applyGiftCardToOrder({
      giftCardId,
      orderId,
      orderTotalEur: remainingEur,
    });
    if (result.ok) {
      remainingEur = round2(remainingEur - result.amountUsedEur);
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ────────── mapping ─────────────────────────────────────────────────────

/**
 * Mollie payment.status → our PaymentStatus.
 * See https://docs.mollie.com/reference/v2/payments-api/get-payment#status
 */
function mapMollieToPaymentStatus(status: string): PaymentStatus {
  if (isPaidStatus(status)) return PaymentStatus.PAID;
  switch (status) {
    case "authorized":
      return PaymentStatus.AUTHORIZED;
    case "canceled":
    case "expired":
    case "failed":
      return PaymentStatus.FAILED;
    case "pending":
    case "open":
    default:
      return PaymentStatus.UNPAID;
  }
}

/**
 * Pick an OrderStatus from the current status + the new payment status.
 *
 *   · Transition to PAID always bumps order → PAID (unless already further
 *     along the pipeline — admin may have shipped already).
 *   · Transition to FAILED leaves the order at PENDING so the admin can
 *     decide whether to cancel or offer a retry. We don't auto-CANCEL
 *     because Mollie treats "expired" the same as "user walked away" and
 *     the cart was already cleared — a retry is still possible via
 *     `order.molliePaymentUrl`.
 */
function deriveOrderStatus(
  current: OrderStatus,
  nextPayment: PaymentStatus,
): OrderStatus {
  if (nextPayment === PaymentStatus.PAID) {
    // Don't roll backwards from SHIPPED/DELIVERED/etc.
    if (current === OrderStatus.PENDING) return OrderStatus.PAID;
    return current;
  }
  return current;
}
