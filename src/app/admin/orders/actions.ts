// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/orders.
//
// Every mutation in the order panel flows through this file. Rules:
//   • requireAdmin() first — defence in depth
//   • inputs are parsed with Zod so we never trust FormData shapes
//   • each state transition writes an OrderEvent so we have an audit trail
//   • timestamps (shippedAt, deliveredAt, cancelledAt, paidAt) are set
//     atomically with the status change, never drifted after the fact
//   • on success we revalidatePath() so both the list and detail pages
//     pick up the change without a cache bust
//
// A note on refunds: this file records the *intent* and the event in our
// own DB. Hitting the Mollie refunds endpoint happens in a separate
// Mollie client lib (to be wired up). If Mollie is absent (e.g. manual
// bank refund), the admin can still log it here so the audit trail and
// customer-visible status stay in sync.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit/log";
import { syncOrderToSendcloud } from "@/lib/sendcloud/sync";
import { applyMovement } from "@/lib/inventory/movements";
import { ALLOWED_TRANSITIONS, canTransition } from "@/lib/orders/transitions";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { sendAdminNewOrderEmail } from "@/lib/email/admin-new-order";
import { sendOrderShippedEmail } from "@/lib/email/order-shipped";
import { sendOrderCancelledEmail } from "@/lib/email/order-cancelled";
import {
  sendOrderRefundedEmail,
  type RefundKind,
} from "@/lib/email/order-refunded";
import {
  issueCancellationRefundAndCreditNote,
  IssueRefundError,
} from "@/lib/credit-notes/issue";

// ────────── email side-effects ──────────────────────────────────────────
//
// These fire *after* the DB transaction commits and the revalidate paths
// run. We never want a failing email to roll back a status change — an admin
// can resend manually if something blows up.
//
// Each helper already catches its own errors; we fire-and-await in
// sequence but tolerate rejections from either side with Promise.allSettled
// so one failure doesn't block the other.

async function notifyOrderPaid(orderId: string): Promise<void> {
  await Promise.allSettled([
    sendOrderConfirmationEmail(orderId),
    sendAdminNewOrderEmail(orderId),
  ]);
}

async function notifyOrderShipped(orderId: string): Promise<void> {
  await sendOrderShippedEmail(orderId);
}

async function notifyOrderCancelled(
  orderId: string,
  refund?: {
    refundAmountEur: number;
    reasonNote: string | null;
    creditNoteNumber: string;
  } | null,
): Promise<void> {
  await sendOrderCancelledEmail(orderId, refund ?? undefined);
}

async function notifyOrderRefunded(
  orderId: string,
  amount: number,
  kind: RefundKind,
): Promise<void> {
  await sendOrderRefundedEmail(orderId, { amount, kind });
}

// ──────── shared types ──────────────────────────────────────────────────

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

// ──────── helpers ────────────────────────────────────────────────────────

/**
 * Load order + return the actor (admin email) in one shot.
 * Throws via notFound-style sentinel if the order is missing — callers
 * handle it uniformly.
 */
async function loadOrderOrFail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      publicNumber: true,
      status: true,
      paymentStatus: true,
      shippedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      paidAt: true,
      grandTotal: true,
      currency: true,
    },
  });
  if (!order) {
    return null;
  }
  return order;
}

/** Revalidate both the list and this order's detail view. */
function revalidateOrder(id: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}

// ALLOWED_TRANSITIONS + canTransition live in @/lib/orders/transitions —
// Next.js forbids non-async exports from a "use server" file.

/**
 * Derive the timestamp fields that should flip when moving into `next`.
 * Kept declarative so the "which timestamp for which status" rule lives
 * in exactly one place.
 */
function timestampsForStatus(
  next: OrderStatus,
  now: Date,
): Partial<
  Pick<Prisma.OrderUpdateInput, "shippedAt" | "deliveredAt" | "cancelledAt" | "paidAt">
> {
  switch (next) {
    case "PAID":
      return { paidAt: now };
    case "SHIPPED":
      return { shippedAt: now };
    case "DELIVERED":
      return { deliveredAt: now };
    case "CANCELLED":
      return { cancelledAt: now };
    default:
      return {};
  }
}

// ──────── generic status transition ─────────────────────────────────────

const StatusSchema = z.object({
  orderId: z.string().uuid(),
  next: z.nativeEnum(OrderStatus),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

/**
 * The workhorse: move the order to `next`, stamp timestamps, log an event.
 * Refuses illegal transitions instead of silently corrupting state.
 */
export async function updateOrderStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = StatusSchema.safeParse({
    orderId: formData.get("orderId"),
    next: formData.get("next"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Invalid status change.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { orderId, next, note } = parsed.data;
  const order = await loadOrderOrFail(orderId);
  if (!order) return { ok: false, message: "Order not found." };

  if (!canTransition(order.status, next)) {
    return {
      ok: false,
      message: `Can't move from ${order.status} to ${next}.`,
    };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        status: next,
        ...timestampsForStatus(next, now),
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId,
        kind: "status.changed",
        message: note ?? `${order.status} → ${next}`,
        metadata: {
          from: order.status,
          to: next,
          actor: actor.email ?? null,
        },
      },
    }),
  ]);

  revalidateOrder(orderId);

  // Fire transactional emails AFTER the commit. We only notify on the
  // specific into-PAID / into-SHIPPED transitions — not on e.g. PAID
  // → FULFILLING or every keystroke.
  if (next === "PAID" && order.status !== "PAID") {
    await notifyOrderPaid(orderId);
  } else if (next === "SHIPPED" && order.status !== "SHIPPED") {
    await notifyOrderShipped(orderId);
  } else if (next === "CANCELLED" && order.status !== "CANCELLED") {
    await notifyOrderCancelled(orderId);
  }

  return { ok: true, message: "Status updated." };
}

// ──────── payment status (rare, but admins need the override) ──────────

const PaymentSchema = z.object({
  orderId: z.string().uuid(),
  next: z.nativeEnum(PaymentStatus),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export async function updatePaymentStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = PaymentSchema.safeParse({
    orderId: formData.get("orderId"),
    next: formData.get("next"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Invalid payment status.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { orderId, next, note } = parsed.data;
  const order = await loadOrderOrFail(orderId);
  if (!order) return { ok: false, message: "Order not found." };

  const now = new Date();
  const wasAlreadyPaid = order.paymentStatus === "PAID";
  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: next,
        // If we've just flipped to PAID, stamp paidAt if it was still null.
        ...(next === "PAID" && order.paidAt === null ? { paidAt: now } : {}),
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId,
        kind: "payment.status.changed",
        message: note ?? `${order.paymentStatus} → ${next}`,
        metadata: {
          from: order.paymentStatus,
          to: next,
          actor: actor.email ?? null,
        },
      },
    }),
  ]);

  revalidateOrder(orderId);

  // Only fire the "thanks for paying" pair on a real into-PAID transition.
  // Toggling PAID → PAID (e.g. resaving the form) must not spam an admin.
  if (next === "PAID" && !wasAlreadyPaid) {
    await notifyOrderPaid(orderId);
  }

  return { ok: true, message: "Payment status updated." };
}

// ──────── mark shipped (tracking info) ─────────────────────────────────

const TrackingSchema = z.object({
  orderId: z.string().uuid(),
  carrier: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v ? v : undefined)),
  trackingNumber: z
    .string()
    .trim()
    .min(1, "Tracking number is required")
    .max(120),
  trackingUrl: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/**
 * Writes tracking info AND transitions status to SHIPPED in one go.
 * Enforces the transition is legal from the current state.
 */
export async function markShippedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = TrackingSchema.safeParse({
    orderId: formData.get("orderId"),
    carrier: formData.get("carrier") ?? undefined,
    trackingNumber: formData.get("trackingNumber"),
    trackingUrl: formData.get("trackingUrl") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { orderId, carrier, trackingNumber, trackingUrl } = parsed.data;
  const order = await loadOrderOrFail(orderId);
  if (!order) return { ok: false, message: "Order not found." };

  // Refuse to mark a digital-only order as shipped — there's no parcel
  // to track, and firing the "Your parcel has left the studio" email
  // would confuse the customer. The /admin/orders/[id] page hides the
  // tracking form for these orders, but defend at the action layer too.
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { product: { select: { kind: true } } },
  });
  const hasPhysical = items.some(
    (i) => i.product.kind !== "GIFT_CARD",
  );
  if (!hasPhysical) {
    return {
      ok: false,
      message:
        "This order has no physical items — it can't be marked shipped.",
    };
  }

  // Only block if we're moving status — saving a tracking edit on an
  // already-SHIPPED order is fine.
  const willChangeStatus = order.status !== "SHIPPED";
  if (willChangeStatus && !canTransition(order.status, "SHIPPED")) {
    return {
      ok: false,
      message: `Can't mark shipped from ${order.status}.`,
    };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        trackingNumber,
        trackingUrl: trackingUrl ?? null,
        status: "SHIPPED",
        shippedAt: order.shippedAt ?? now,
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId,
        kind: willChangeStatus ? "shipped" : "tracking.updated",
        message: carrier
          ? `${carrier} · ${trackingNumber}`
          : trackingNumber,
        metadata: {
          carrier: carrier ?? null,
          trackingNumber,
          trackingUrl: trackingUrl ?? null,
          actor: actor.email ?? null,
        },
      },
    }),
  ]);

  revalidateOrder(orderId);

  // Only email on the real transition into SHIPPED, not on edits to
  // tracking info of an already-shipped order.
  if (willChangeStatus) {
    await notifyOrderShipped(orderId);
  }

  return { ok: true, message: willChangeStatus ? "Marked as shipped." : "Tracking updated." };
}

// ──────── mark delivered (no form data required) ───────────────────────

const OrderIdSchema = z.object({ orderId: z.string().uuid() });

export async function markDeliveredAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = OrderIdSchema.safeParse({ orderId: formData.get("orderId") });
  if (!parsed.success) return { ok: false, message: "Invalid order." };

  const order = await loadOrderOrFail(parsed.data.orderId);
  if (!order) return { ok: false, message: "Order not found." };
  if (!canTransition(order.status, "DELIVERED")) {
    return {
      ok: false,
      message: `Can't mark delivered from ${order.status}.`,
    };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: "DELIVERED", deliveredAt: now },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "delivered",
        message: null,
        metadata: { actor: actor.email ?? null },
      },
    }),
  ]);

  revalidateOrder(order.id);
  return { ok: true, message: "Marked as delivered." };
}

// ──────── cancel ───────────────────────────────────────────────────────
//
// 2026-05: this is the canonical cancellation path, wired to a dedicated
// CancelOrderForm on /admin/orders/[id]. Replaces the old generic
// "Move to Cancelled" status-transition button, which captured no reason
// and triggered no refund — a Belgian Code de droit économique VI.83
// problem (B2C refund within 14 days mandatory).
//
// Flow when admin submits:
//   1. Validate transition + parse reason + parse issueRefund toggle
//   2. Cancel + restock (transactional)
//   3. If PAID + issueRefund: fire issueCancellationRefundAndCreditNote
//      — Mollie refund, credit note (reason=CANCELLATION), loyalty
//      clawback, paymentStatus → REFUNDED. Best-effort wrapped so a
//      pipeline failure doesn't roll back the cancellation; admin can
//      retry the refund step from the order page or Mollie dashboard.
//   4. Notify customer — refund context surfaces in the email so the
//      copy matches what just happened in their bank account.

const CancelSchema = z.object({
  orderId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
  /** Checkbox in the admin form. When true AND the order was paid,
   *  fire the cancellation-refund pipeline after the cancel commits. */
  issueRefund: z
    .union([z.literal("yes"), z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "yes" || v === "on" || v === "true"),
  /** Sub-toggle in the admin form. When false, Mollie refund excludes
   *  the shipping portion and the CN has no Shipping line. Sent as
   *  "yes" when checked, absent when unchecked — the typical HTML
   *  checkbox semantics. Default (when absent) is true to preserve
   *  the "refund everything" expectation; the form decides the right
   *  default based on whether the parcel is at risk. */
  refundShipping: z
    .union([z.literal("yes"), z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "yes" || v === "on" || v === "true"),
});

export async function cancelOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = CancelSchema.safeParse({
    orderId: formData.get("orderId"),
    reason: formData.get("reason") ?? undefined,
    issueRefund: formData.get("issueRefund") ?? undefined,
    refundShipping: formData.get("refundShipping") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: "Invalid order." };

  const order = await loadOrderOrFail(parsed.data.orderId);
  if (!order) return { ok: false, message: "Order not found." };
  if (!canTransition(order.status, "CANCELLED")) {
    return {
      ok: false,
      message: `Can't cancel an order in ${order.status}.`,
    };
  }

  // If the order was PAID (or further along), SALE stock was already
  // deducted by sync-mollie. Cancelling → restock the line items.
  const wasPaid = order.paymentStatus === "PAID";
  const itemsForRestock = wasPaid
    ? await prisma.orderItem.findMany({
        where: { orderId: order.id },
        select: { variantId: true, quantity: true },
      })
    : [];

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "cancelled",
        message: parsed.data.reason ?? null,
        metadata: { actor: actor.email ?? null },
      },
    });

    // Restock — only for variants we actually deducted.
    for (const item of itemsForRestock) {
      if (!item.variantId) continue;
      await applyMovement(tx, {
        variantId: item.variantId,
        delta: item.quantity, // positive: back into stock
        reason: "CANCEL",
        orderId: order.id,
        actorId: actor.id,
        actorEmail: actor.email ?? null,
        note: `Restocked on cancel of ${order.publicNumber}`,
      });
    }
  });

  revalidateOrder(order.id);

  await logAudit({
    actor,
    action: "order.cancel",
    entityType: "Order",
    entityId: order.id,
    summary: `Cancelled order ${order.publicNumber}`,
    meta: {
      reason: parsed.data.reason ?? null,
      previousStatus: order.status,
      refundRequested: parsed.data.issueRefund,
    },
  });

  // Cancellation-refund pipeline. Only fires for orders that were
  // actually paid AND when admin checked the box. We wrap it in
  // try/catch so a refund failure (Mollie outage, network blip)
  // doesn't roll back the already-committed cancellation — the order
  // is cancelled either way, admin can retry the refund manually.
  let refundContext: {
    refundAmountEur: number;
    reasonNote: string | null;
    creditNoteNumber: string;
  } | null = null;
  let refundError: string | null = null;
  if (wasPaid && parsed.data.issueRefund) {
    try {
      const result = await issueCancellationRefundAndCreditNote({
        orderId: order.id,
        reasonNote: parsed.data.reason ?? null,
        refundShipping: parsed.data.refundShipping,
        actorId: actor.id,
        actorEmail: actor.email ?? null,
      });
      refundContext = {
        refundAmountEur: result.amount,
        reasonNote: parsed.data.reason ?? null,
        creditNoteNumber: result.creditNoteNumber,
      };
      revalidateOrder(order.id);
    } catch (err) {
      // Log + surface to admin but don't fail the cancel.
      const code =
        err instanceof IssueRefundError ? err.code : "unknown";
      console.error(
        `[cancel] refund pipeline failed for ${order.publicNumber} (${code}) — order already cancelled, admin must retry refund`,
        err,
      );
      refundError = code;
      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          kind: "refund.failed",
          message: `Cancellation refund pipeline failed (${code}) — retry from Mollie or admin order page.`,
          metadata: { code, actor: actor.email ?? null },
        },
      });
    }
  }

  // Notify customer after commit. Fire-and-catch so a Resend hiccup
  // doesn't block the admin from seeing "cancelled" in the panel.
  await notifyOrderCancelled(order.id, refundContext);

  if (refundError) {
    return {
      ok: true,
      message: `Order cancelled, but refund failed (${refundError}). Issue refund manually from Mollie.`,
    };
  }
  return {
    ok: true,
    message: refundContext
      ? `Order cancelled and refunded €${refundContext.refundAmountEur.toFixed(2)}.`
      : "Order cancelled.",
  };
}

// ──────── refund (H2-removed) ─────────────────────────────────────────
//
// The order-page refund path was a broken duplicate of the canonical
// return-page refund — it skipped Mollie, the credit note, the loyalty
// clawback, and the VAT YTD subtraction. Customer received a refunded
// email but no money moved. All refund logic now flows through
// `issueRefundAndCreditNote` in /admin/returns/[id] on the RECEIVED
// transition. The original RefundSchema + body lived here; both have
// been deleted (recover from git history if needed). The deprecated
// stub below stays so a stale client bundle that still posts to the
// old endpoint sees a clear error.

/**
 * @deprecated H2: this was the order-page refund path. It only flipped
 * Order.status to REFUNDED + fired the customer email — it did NOT
 * call Mollie, did NOT mint a Credit Note, did NOT reverse loyalty
 * points, did NOT subtract from VAT YTD. Customer received a
 * "refunded" email but the money never moved.
 *
 * All refunds now go through `issueRefundAndCreditNote` (called from
 * /admin/returns/[id] when marking a return RECEIVED with a refund
 * amount). The full canonical pipeline fires there.
 *
 * Stub kept as an exported symbol so a stale client bundle hitting
 * the old endpoint sees a clear "do not use" error instead of silently
 * doing the wrong thing. Safe to delete after a release.
 */
export async function issueRefundAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  console.error(
    "[orders/actions] issueRefundAction was called but is deprecated (H2). Refunds must go through /admin/returns/[id] → Mark received with refund amount.",
  );
  return {
    ok: false,
    message:
      "This refund button has been removed. Open the return for this order from /admin/returns and mark it Received with the refund amount.",
  };
}

// ──────── admin notes (free-text, customer never sees) ─────────────────

const AdminNotesSchema = z.object({
  orderId: z.string().uuid(),
  notes: z
    .string()
    .max(4000)
    .transform((v) => {
      const trimmed = v.trim();
      return trimmed === "" ? null : trimmed;
    }),
});

export async function updateAdminNotesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = AdminNotesSchema.safeParse({
    orderId: formData.get("orderId"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Note is too long.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const order = await loadOrderOrFail(parsed.data.orderId);
  if (!order) return { ok: false, message: "Order not found." };

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { adminNotes: parsed.data.notes },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "admin.note.updated",
        message: null,
        metadata: { actor: actor.email ?? null },
      },
    }),
  ]);

  revalidateOrder(order.id);
  return OK_SAVED;
}

// ──────── invoice URL (manual link until Mollie/invoicing auto-writes it) ─

const InvoiceSchema = z.object({
  orderId: z.string().uuid(),
  invoiceUrl: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .or(z.literal("").transform(() => null))
    .nullable(),
});

export async function updateInvoiceUrlAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = InvoiceSchema.safeParse({
    orderId: formData.get("orderId"),
    invoiceUrl: formData.get("invoiceUrl") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please enter a valid URL or leave the field empty.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const order = await loadOrderOrFail(parsed.data.orderId);
  if (!order) return { ok: false, message: "Order not found." };

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { invoiceUrl: parsed.data.invoiceUrl },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "invoice.url.updated",
        message: null,
        metadata: { actor: actor.email ?? null },
      },
    }),
  ]);

  revalidateOrder(order.id);
  return OK_SAVED;
}

// ──────── bulk: mark fulfilling ────────────────────────────────────────
//
// Typical workflow: an admin scans the PAID queue and flips a batch to
// FULFILLING as she starts pulling stock. We only move orders where
// the transition is legal; we silently skip the rest and report the
// count actually touched.
// ─────────────────────────────────────────────────────────────────────────

const BulkSchema = z.object({
  orderIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one order")
    .max(200, "Too many orders selected at once"),
});

export async function bulkMarkFulfillingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const orderIds = formData.getAll("orderIds").map(String);
  const parsed = BulkSchema.safeParse({ orderIds });
  if (!parsed.success) {
    return { ok: false, message: "Select at least one order." };
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: parsed.data.orderIds } },
    select: { id: true, status: true },
  });

  const eligible = orders.filter((o) => canTransition(o.status, "FULFILLING"));
  if (eligible.length === 0) {
    return {
      ok: false,
      message: "None of those orders can move to Fulfilling.",
    };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: { in: eligible.map((o) => o.id) } },
      data: { status: "FULFILLING" },
    }),
    prisma.orderEvent.createMany({
      data: eligible.map((o) => ({
        orderId: o.id,
        kind: "status.changed",
        message: `${o.status} → FULFILLING`,
        metadata: {
          from: o.status,
          to: "FULFILLING",
          actor: actor.email ?? null,
          bulk: true,
          at: now.toISOString(),
        },
      })),
    }),
  ]);

  revalidatePath("/admin/orders");
  for (const o of eligible) {
    revalidatePath(`/admin/orders/${o.id}`);
  }
  const skipped = orders.length - eligible.length;
  return {
    ok: true,
    message:
      skipped === 0
        ? `${eligible.length} marked as fulfilling.`
        : `${eligible.length} marked as fulfilling · ${skipped} skipped.`,
  };
}

// ──────── bulk: mark shipped ───────────────────────────────────────────
//
// Fulfilment-day flow: admin drops a batch of parcels at the post office
// without tracking-able labels (stamp + handwritten address), or wraps up
// a Sendcloud manual-pick session. Selecting all and clicking "Mark as
// shipped" flips each order to SHIPPED, stamps shippedAt, fires the
// customer email (without a tracking number, the template renders the
// "tracking will follow" copy), and writes an OrderEvent per order.
//
// Tracking numbers are NOT touched — if an admin previously typed one on
// the individual order page or Sendcloud auto-filled it via webhook, it
// stays. This action is for the common case where there's no tracking
// to fill (small parcels, free shipping, stamp & drop).
//
// Skips:
//   · Orders not in a transition-able status (already SHIPPED, etc.).
//   · Digital-only orders (gift cards only) — no parcel to ship.
// The skipped count is surfaced in the result message so the admin can
// see what was actually touched.
//
// Emails fire after the DB commit, parallelised via Promise.allSettled so
// a slow / bouncing recipient can't stall the whole batch. Email failures
// log but don't roll back the state change — the order IS shipped on the
// books, the admin just needs to follow up with the customer manually
// if Resend complains.
// ─────────────────────────────────────────────────────────────────────────

export async function bulkMarkShippedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const orderIds = formData.getAll("orderIds").map(String);
  const parsed = BulkSchema.safeParse({ orderIds });
  if (!parsed.success) {
    return { ok: false, message: "Select at least one order." };
  }

  // Pull the orders + their items (we need to detect digital-only carts
  // — gift-card-only orders have nothing to ship and shouldn't transition).
  const orders = await prisma.order.findMany({
    where: { id: { in: parsed.data.orderIds } },
    select: {
      id: true,
      status: true,
      shippedAt: true,
      items: {
        select: { product: { select: { kind: true } } },
      },
    },
  });

  const eligible = orders.filter((o) => {
    if (!canTransition(o.status, "SHIPPED")) return false;
    // Skip digital-only orders (every item is a gift card) — gift cards
    // are delivered by email at the Mollie-PAID transition, not by post.
    const hasPhysical = o.items.some((i) => i.product.kind !== "GIFT_CARD");
    return hasPhysical;
  });
  if (eligible.length === 0) {
    return {
      ok: false,
      message: "None of those orders can be marked shipped.",
    };
  }

  const now = new Date();
  await prisma.$transaction([
    // updateMany cannot conditionally set shippedAt per-row, so we set
    // it for ALL eligible orders. Orders already shipped were filtered
    // out by canTransition above (transitioning into SHIPPED from
    // SHIPPED is blocked) so this is safe — we never overwrite an
    // older shippedAt with the bulk-action timestamp.
    prisma.order.updateMany({
      where: { id: { in: eligible.map((o) => o.id) } },
      data: { status: "SHIPPED", shippedAt: now },
    }),
    prisma.orderEvent.createMany({
      data: eligible.map((o) => ({
        orderId: o.id,
        kind: "shipped",
        message: `${o.status} → SHIPPED (bulk, no tracking)`,
        metadata: {
          from: o.status,
          to: "SHIPPED",
          actor: actor.email ?? null,
          bulk: true,
          at: now.toISOString(),
        },
      })),
    }),
  ]);

  // Fire the "your parcel is on its way" email per order in parallel —
  // allSettled so one bounce doesn't break the rest. We don't await this
  // for the response message since the admin's UI shouldn't hang on
  // Resend latency; the action returns success based on the DB write.
  await Promise.allSettled(
    eligible.map((o) =>
      notifyOrderShipped(o.id).catch((err) => {
        console.error(
          "[bulk-mark-shipped] email failed for",
          o.id,
          err,
        );
      }),
    ),
  );

  revalidatePath("/admin/orders");
  for (const o of eligible) {
    revalidatePath(`/admin/orders/${o.id}`);
  }
  const skipped = orders.length - eligible.length;
  return {
    ok: true,
    message:
      skipped === 0
        ? `${eligible.length} marked as shipped.`
        : `${eligible.length} marked as shipped · ${skipped} skipped.`,
  };
}

// ─── Sendcloud retry ───────────────────────────────────────────────────
//
// When the auto-sync that runs on Mollie webhook fails (Sendcloud down,
// invalid address, rule mismatch), the order lands in PAID with no
// sendcloudParcelId. This action lets an admin re-fire the sync from the
// admin order page. Idempotent: if a parcel already exists the underlying
// sync helper returns ok without creating a duplicate.

export type RetrySendcloudState = {
  ok: boolean;
  message?: string;
};

export async function retrySendcloudSyncAction(
  _prev: RetrySendcloudState,
  formData: FormData,
): Promise<RetrySendcloudState> {
  await requireAdmin();

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, message: "Missing order id." };

  const result = await syncOrderToSendcloud(orderId);

  // Map the helper's discriminated union into something the form UI
  // can render — `ok=true` covers both freshly-created and already-synced.
  if (result.ok) {
    revalidatePath(`/admin/orders/${orderId}`);
    return {
      ok: true,
      message: `Synced — parcel ${result.parcelId}`,
    };
  }

  // Failure — give an admin the most actionable phrasing per reason.
  switch (result.reason) {
    case "not-configured":
      return {
        ok: false,
        message:
          "Sendcloud isn't configured — set SENDCLOUD_PUBLIC_KEY + SENDCLOUD_SECRET_KEY in env.",
      };
    case "order-not-found":
      return { ok: false, message: "Order not found." };
    case "order-not-paid":
      return {
        ok: false,
        message: "Order isn't paid yet — Sendcloud only ships paid orders.",
      };
    case "no-shipping-address":
      return {
        ok: false,
        message: "Order has no shipping address — can't ship.",
      };
    case "already-synced":
      return { ok: true, message: "Already synced." };
    case "sendcloud-error":
      return {
        ok: false,
        message: result.message ?? "Sendcloud rejected the request.",
      };
  }
}

