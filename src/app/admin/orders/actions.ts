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
import { ALLOWED_TRANSITIONS, canTransition } from "@/lib/orders/transitions";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { sendAdminNewOrderEmail } from "@/lib/email/admin-new-order";
import { sendOrderShippedEmail } from "@/lib/email/order-shipped";
import { sendOrderCancelledEmail } from "@/lib/email/order-cancelled";
import {
  sendOrderRefundedEmail,
  type RefundKind,
} from "@/lib/email/order-refunded";

// ────────── email side-effects ──────────────────────────────────────────
//
// These fire *after* the DB transaction commits and the revalidate paths
// run. We never want a failing email to roll back a status change — Sofia
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

async function notifyOrderCancelled(orderId: string): Promise<void> {
  await sendOrderCancelledEmail(orderId);
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

/** Parse money from a FormData entry. Accepts "12,50" or "12.50". */
function parseMoney(raw: FormDataEntryValue | null): Prisma.Decimal | null {
  if (raw === null) return null;
  const s = String(raw).trim().replace(",", ".");
  if (s === "") return null;
  return new Prisma.Decimal(s);
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
  // Toggling PAID → PAID (e.g. resaving the form) must not spam Sofia.
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

const CancelSchema = z.object({
  orderId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export async function cancelOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = CancelSchema.safeParse({
    orderId: formData.get("orderId"),
    reason: formData.get("reason") ?? undefined,
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

  const now = new Date();
  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: now },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "cancelled",
        message: parsed.data.reason ?? null,
        metadata: { actor: actor.email ?? null },
      },
    }),
  ]);

  revalidateOrder(order.id);

  // Notify customer after commit. Fire-and-catch so a Resend hiccup
  // doesn't block the admin from seeing "cancelled" in the panel.
  await notifyOrderCancelled(order.id);

  return { ok: true, message: "Order cancelled." };
}

// ──────── refund (full / partial) ──────────────────────────────────────

const RefundSchema = z
  .object({
    orderId: z.string().uuid(),
    kind: z.enum(["full", "partial"]),
    // Amount in the order's currency, e.g. "12.50". Required when kind=partial.
    amount: z.string().trim().optional(),
    reason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v ? v : undefined)),
    // If checked, the admin is telling us the money moved elsewhere
    // (e.g. manual bank transfer) — we just log it here.
    external: z.coerce.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "partial") {
      const raw = (v.amount ?? "").replace(",", ".").trim();
      if (raw === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "Amount is required for partial refunds.",
        });
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount"],
          message: "Enter a positive amount.",
        });
      }
    }
  });

export async function issueRefundAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = RefundSchema.safeParse({
    orderId: formData.get("orderId"),
    kind: formData.get("kind"),
    amount: formData.get("amount") ?? undefined,
    reason: formData.get("reason") ?? undefined,
    external: formData.get("external") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { orderId, kind, reason, external } = parsed.data;
  const order = await loadOrderOrFail(orderId);
  if (!order) return { ok: false, message: "Order not found." };

  // Determine target payment + order statuses.
  const grand = Number(order.grandTotal);
  let amount: number;
  if (kind === "full") {
    amount = grand;
  } else {
    amount = Number(String(parsed.data.amount ?? "0").replace(",", "."));
    if (amount > grand) {
      return {
        ok: false,
        message: "Refund amount can't exceed the order total.",
        fieldErrors: { amount: ["Amount exceeds order total"] },
      };
    }
  }

  const nextOrderStatus: OrderStatus =
    kind === "full" ? "REFUNDED" : "PARTIALLY_REFUNDED";
  const nextPaymentStatus: PaymentStatus =
    kind === "full" ? "REFUNDED" : "PARTIALLY_REFUNDED";

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        status: nextOrderStatus,
        paymentStatus: nextPaymentStatus,
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "refund.issued",
        message: reason ?? null,
        metadata: {
          kind,
          amount: amount.toFixed(2),
          currency: order.currency,
          external: Boolean(external),
          actor: actor.email ?? null,
        },
      },
    }),
  ]);

  revalidateOrder(order.id);

  // Notify customer after commit. Amount + kind come from the validated
  // form — the email template formats the money using the order's locale.
  await notifyOrderRefunded(order.id, amount, kind);

  return { ok: true, message: `Refund recorded (${amount.toFixed(2)} ${order.currency}).` };
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
// Typical workflow: Sofia scans the PAID queue and flips a batch to
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

// ──────── re-export for convenience (silence unused-warning) ──────────
// parseMoney is exported from the product actions file too; kept here
// available for future refund-from-line-items logic.
export { parseMoney };
