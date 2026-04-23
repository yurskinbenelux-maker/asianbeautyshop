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
import { sendAdminNewOrderEmail } from "@/lib/email/admin-new-order";
import { applyMovement } from "@/lib/inventory/movements";

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
  const willFlipToPaid =
    order.paymentStatus !== PaymentStatus.PAID &&
    nextPayment === PaymentStatus.PAID;

  // On the into-PAID transition, pull the line items so we can decrement
  // stock for each variant inside the same transaction. On any other
  // transition we skip — stock already moved on the original paid event.
  let paidItems: Array<{ variantId: string | null; quantity: number }> = [];
  if (willFlipToPaid) {
    paidItems = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: { variantId: true, quantity: true },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: nextPayment,
        status: nextOrder,
        ...(willFlipToPaid && order.paidAt === null
          ? { paidAt: now }
          : {}),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        kind: willFlipToPaid
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

    // Inventory deduction — only on the real into-PAID transition. Runs
    // inside the same tx so a variant FK miss rolls everything back rather
    // than marking the order PAID with phantom stock.
    if (willFlipToPaid) {
      for (const item of paidItems) {
        if (!item.variantId) continue; // products without variants: out of scope
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
  if (willFlipToPaid) {
    await Promise.allSettled([
      sendOrderConfirmationEmail(order.id),
      sendAdminNewOrderEmail(order.id),
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
    paidTransition: willFlipToPaid,
  };
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
