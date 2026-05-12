// ─────────────────────────────────────────────────────────────────────────
// Returns DB layer — the only place that touches the `returnRequest` /
// `returnItem` Prisma models.
//
// Why a single choke-point?
//   · Downstream (customer UI, admin UI) only needs CRUD-ish helpers.
//     A single module keeps the query shapes consistent.
//   · Historically this file also carried `// @ts-expect-error` casts
//     while the returnRequest / returnItem models were staged but not
//     yet generated into the Prisma client. Those directives were
//     removed on 2026-04-23 after `prisma migrate deploy` landed the
//     tables — the typed Prisma client is authoritative now.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import type {
  ReturnRow,
  ReturnItemRow,
  ReturnReason,
  ReturnStatus,
} from "./types";
import { canTransition } from "./types";
import { applyMovement } from "@/lib/inventory/movements";

// ────────── helpers ──────────────────────────────────────────────────────

type RawReturnItem = {
  id: string;
  orderItemId: string;
  nameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  // Per-item adjudication columns added 2026-05. NULL = not yet
  // adjudicated. See ReturnItem in schema.prisma for full semantics.
  acceptedRefundEur: unknown | null;
  rejectionReason: string | null;
  // Denormalised snapshot of the underlying product's kind (added
  // 2026-05). Lets the admin UI disable gift-card rows and the refund
  // pipeline reject them server-side without joining through OrderItem
  // → Product. Lives alongside nameSnapshot / skuSnapshot in spirit.
  //
  // Marked optional here so this file typechecks BEFORE Max runs
  // `prisma generate` against the updated schema — the generated
  // client only adds this field once regen has happened. mapItem
  // defaults to STANDARD when the field is undefined.
  productKindSnapshot?: "STANDARD" | "GIFT_CARD";
  unitPrice: unknown; // Decimal
  lineTotal: unknown; // Decimal
};

type RawReturn = {
  id: string;
  publicNumber: string;
  orderId: string;
  userId: string | null;
  status: ReturnStatus;
  reason: ReturnReason;
  details: string | null;
  adminNotes: string | null;
  refundAmount: unknown | null;
  refundedAt: Date | null;
  mollieRefundId: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  returnLabelUrl: string | null;
  sendcloudReturnParcelId: string | null;
  receivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: RawReturnItem[];
  order: {
    publicNumber: string;
    email: string;
  };
  user: {
    firstName: string | null;
    lastName: string | null;
  } | null;
};

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number.parseFloat(v);
  // Prisma Decimal: has toNumber()
  const maybe = v as { toNumber?: () => number };
  if (typeof maybe.toNumber === "function") return maybe.toNumber();
  return Number(v);
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return toNumber(v);
}

function mapItem(raw: RawReturnItem): ReturnItemRow {
  return {
    id: raw.id,
    orderItemId: raw.orderItemId,
    nameSnapshot: raw.nameSnapshot,
    skuSnapshot: raw.skuSnapshot,
    quantity: raw.quantity,
    unitPrice: toNumber(raw.unitPrice),
    lineTotal: toNumber(raw.lineTotal),
    acceptedRefundEur: toNumberOrNull(raw.acceptedRefundEur),
    rejectionReason: raw.rejectionReason,
    productKind: raw.productKindSnapshot ?? "STANDARD",
  };
}

function mapRow(raw: RawReturn): ReturnRow {
  return {
    id: raw.id,
    publicNumber: raw.publicNumber,
    orderId: raw.orderId,
    orderPublicNumber: raw.order.publicNumber,
    orderEmail: raw.order.email,
    userId: raw.userId,
    customerFirstName: raw.user?.firstName ?? null,
    customerLastName: raw.user?.lastName ?? null,
    status: raw.status,
    reason: raw.reason,
    details: raw.details,
    adminNotes: raw.adminNotes,
    refundAmount: toNumberOrNull(raw.refundAmount),
    refundedAt: raw.refundedAt,
    mollieRefundId: raw.mollieRefundId,
    trackingNumber: raw.trackingNumber,
    trackingUrl: raw.trackingUrl,
    returnLabelUrl: raw.returnLabelUrl,
    sendcloudReturnParcelId: raw.sendcloudReturnParcelId,
    receivedAt: raw.receivedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    items: raw.items.map(mapItem),
  };
}

// ────────── public numbers ───────────────────────────────────────────────

/**
 * Mint a reference the customer will see — appends "-R<n>" to the order's
 * public number, incrementing per existing return against that order.
 * Example: ABS-1042 → ABS-1042-R1, ABS-1042-R2, …
 */
async function mintReturnReference(orderPublicNumber: string): Promise<string> {
  const count = (await prisma.returnRequest.count({
    where: { order: { publicNumber: orderPublicNumber } },
  })) as number;
  return `${orderPublicNumber}-R${count + 1}`;
}

// ────────── customer queries ─────────────────────────────────────────────

export async function getReturnsForUser(userId: string): Promise<ReturnRow[]> {
  const rows = (await prisma.returnRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      // productKindSnapshot is a plain column on ReturnItem (added
      // 2026-05), so a flat `include: true` is enough. No need to
      // join through orderItem → product anymore.
      items: true,
      order: { select: { publicNumber: true, email: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  })) as RawReturn[];
  return rows.map(mapRow);
}

export async function getReturnByPublicNumberForUser(
  userId: string,
  publicNumber: string,
): Promise<ReturnRow | null> {
  const row = (await prisma.returnRequest.findFirst({
    where: { userId, publicNumber },
    include: {
      // productKindSnapshot is a plain column on ReturnItem (added
      // 2026-05), so a flat `include: true` is enough. No need to
      // join through orderItem → product anymore.
      items: true,
      order: { select: { publicNumber: true, email: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  })) as RawReturn | null;
  return row ? mapRow(row) : null;
}

// ────────── admin queries ────────────────────────────────────────────────

export async function listReturnsForAdmin(params?: {
  status?: ReturnStatus;
  limit?: number;
  offset?: number;
}): Promise<{ rows: ReturnRow[]; total: number }> {
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  const where = params?.status ? { status: params.status } : undefined;

  const [rows, total] = (await Promise.all([
    prisma.returnRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        // productKindSnapshot is a plain column on ReturnItem (added
      // 2026-05), so a flat `include: true` is enough. No need to
      // join through orderItem → product anymore.
      items: true,
        order: { select: { publicNumber: true, email: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.returnRequest.count({ where }),
  ])) as [RawReturn[], number];

  return { rows: rows.map(mapRow), total };
}

export async function getReturnByIdForAdmin(
  id: string,
): Promise<ReturnRow | null> {
  const row = (await prisma.returnRequest.findUnique({
    where: { id },
    include: {
      // productKindSnapshot is a plain column on ReturnItem (added
      // 2026-05), so a flat `include: true` is enough. No need to
      // join through orderItem → product anymore.
      items: true,
      order: { select: { publicNumber: true, email: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  })) as RawReturn | null;
  return row ? mapRow(row) : null;
}

// ────────── create ───────────────────────────────────────────────────────

export type CreateReturnInput = {
  orderId: string;
  userId: string | null;
  reason: ReturnReason;
  details?: string | null;
  /**
   * (orderItemId, quantity) pairs — must already be validated against the
   * caller's order (customer can only return their own lines).
   */
  items: Array<{
    orderItemId: string;
    quantity: number;
    nameSnapshot: string;
    skuSnapshot: string;
    unitPrice: number;
    /** Snapshot of the underlying product's kind. Optional — falls
     *  back to STANDARD if the caller doesn't know (e.g. a future
     *  email-token guest path). Real callers should always pass it. */
    productKind?: "STANDARD" | "GIFT_CARD";
  }>;
};

export async function createReturnRequest(
  input: CreateReturnInput,
): Promise<ReturnRow> {
  // We need the order's public number to mint a reference.
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { publicNumber: true },
  });
  if (!order) {
    throw new Error(`Order ${input.orderId} not found when creating return`);
  }

  const publicNumber = await mintReturnReference(order.publicNumber);

  const created = (await prisma.returnRequest.create({
    data: {
      publicNumber,
      orderId: input.orderId,
      userId: input.userId,
      reason: input.reason,
      details: input.details ?? null,
      items: {
        create: input.items.map((it) => ({
          orderItemId: it.orderItemId,
          nameSnapshot: it.nameSnapshot,
          skuSnapshot: it.skuSnapshot,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: Math.round(it.unitPrice * it.quantity * 100) / 100,
          productKindSnapshot: it.productKind ?? "STANDARD",
        })),
      },
    },
    include: {
      // productKindSnapshot is a plain column on ReturnItem (added
      // 2026-05), so a flat `include: true` is enough. No need to
      // join through orderItem → product anymore.
      items: true,
      order: { select: { publicNumber: true, email: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  })) as RawReturn;

  return mapRow(created);
}

// ────────── admin field patch (H1 fix) ───────────────────────────────────
//
// Why this exists separately from transitionReturnStatus:
//
// The admin notes/refund/tracking form previously routed through
// transitionReturnStatus(returnId, current.status, { ... }) as a
// "no-op transition" — but ALLOWED_TRANSITIONS doesn't include self-
// transitions (APPROVED→APPROVED, RECEIVED→RECEIVED, etc.), so the
// canTransition guard inside the helper threw `transition_forbidden`,
// the action swallowed the error, and the form looked like it saved
// but nothing persisted.
//
// Symptom Max saw: enter refundAmount → click save → field blank
// after refresh. Cascading consequence: A1's "Mark received"
// short-circuited because refundAmount was 0, no Mollie refund fired,
// no credit note generated, no loyalty clawback, VAT YTD widget
// didn't subtract. Single bug masking the entire refund pipeline.
//
// This helper bypasses the transition guard (there's nothing to
// validate — the status isn't changing) and just writes the patch
// fields. Refund amount, admin notes, and tracking info can all be
// edited at any status without policy concerns.
export async function updateReturnAdminFields(
  returnId: string,
  patch: {
    adminNotes?: string | null;
    refundAmount?: number | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
  },
): Promise<ReturnRow> {
  const current = await getReturnByIdForAdmin(returnId);
  if (!current) throw new Error("return_not_found");

  // Only write fields that were explicitly provided. `undefined` means
  // "form didn't include this field, leave it alone"; `null` means
  // "user cleared it, write null to the DB". The same convention
  // transitionReturnStatus uses, just without the transition guard.
  const data: Record<string, unknown> = {};
  if (patch.adminNotes !== undefined) data.adminNotes = patch.adminNotes;
  if (patch.refundAmount !== undefined) data.refundAmount = patch.refundAmount;
  if (patch.trackingNumber !== undefined)
    data.trackingNumber = patch.trackingNumber;
  if (patch.trackingUrl !== undefined) data.trackingUrl = patch.trackingUrl;

  if (Object.keys(data).length === 0) {
    // No-op — nothing to update. Return current row unchanged.
    return current;
  }

  const updated = (await prisma.returnRequest.update({
    where: { id: returnId },
    data,
    include: {
      // productKindSnapshot is a plain column on ReturnItem (added
      // 2026-05), so a flat `include: true` is enough. No need to
      // join through orderItem → product anymore.
      items: true,
      order: { select: { publicNumber: true, email: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  })) as RawReturn;

  return mapRow(updated);
}

// ────────── status transitions (admin) ───────────────────────────────────

export async function transitionReturnStatus(
  returnId: string,
  to: ReturnStatus,
  patch?: {
    adminNotes?: string | null;
    refundAmount?: number | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    /** Actor metadata — threaded through to InventoryMovement when the
     *  RECEIVED transition restocks goods. Optional; omit for system
     *  transitions (customer self-cancel, etc.). */
    actorId?: string | null;
    actorEmail?: string | null;
  },
): Promise<ReturnRow> {
  const current = await getReturnByIdForAdmin(returnId);
  if (!current) throw new Error("return_not_found");
  if (!canTransition(current.status, to)) {
    throw new Error(`transition_forbidden:${current.status}→${to}`);
  }

  const now = new Date();
  const data: Record<string, unknown> = {
    status: to,
    adminNotes: patch?.adminNotes ?? current.adminNotes,
  };

  if (to === "RECEIVED") data.receivedAt = now;
  if (to === "REFUNDED") data.refundedAt = now;
  if (patch?.refundAmount !== undefined) data.refundAmount = patch.refundAmount;
  if (patch?.trackingNumber !== undefined)
    data.trackingNumber = patch.trackingNumber;
  if (patch?.trackingUrl !== undefined) data.trackingUrl = patch.trackingUrl;

  // Resolve variantIds for restock BEFORE the transaction so we can roll
  // the whole thing back if something goes wrong. Only needed on the
  // RECEIVED transition — other transitions don't touch stock.
  //
  // 2026-05 (per-item adjudication): restock ONLY lines the admin
  // accepted (acceptedRefundEur > 0). Rejected lines (€0 refund —
  // "Opened and used", "Item missing", "Damaged on receipt", etc.)
  // don't go back on the shelf, they're written off. Gift-card lines
  // are always excluded — they're not physical inventory and the
  // adjudication form locks them at €0 anyway.
  //
  // Legacy fallback: when acceptedRefundEur is null (return predates
  // the adjudication form, or admin clicked Mark Received without
  // ever opening the form), treat as fully accepted — matches the
  // pre-2026-05 behaviour so old returns don't suddenly stop
  // restocking.
  let restockPairs: Array<{ variantId: string; quantity: number }> = [];
  const willRestock = to === "RECEIVED" && current.status !== "RECEIVED";
  if (willRestock) {
    const accepted = current.items.filter((it) => {
      if (it.productKind === "GIFT_CARD") return false;
      if (it.acceptedRefundEur === null) return true; // legacy
      return it.acceptedRefundEur > 0;
    });
    const orderItemIds = accepted.map((it) => it.orderItemId);
    const orderItems = orderItemIds.length
      ? await prisma.orderItem.findMany({
          where: { id: { in: orderItemIds } },
          select: { id: true, variantId: true },
        })
      : [];
    const variantByOrderItem = new Map(
      orderItems.map((oi) => [oi.id, oi.variantId]),
    );
    restockPairs = accepted
      .map((it) => ({
        variantId: variantByOrderItem.get(it.orderItemId) ?? null,
        quantity: it.quantity,
      }))
      .filter(
        (p): p is { variantId: string; quantity: number } =>
          typeof p.variantId === "string" && p.quantity > 0,
      );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedRow = (await tx.returnRequest.update({
      where: { id: returnId },
      data,
      include: {
        // productKindSnapshot is a plain column on ReturnItem (added
      // 2026-05), so a flat `include: true` is enough. No need to
      // join through orderItem → product anymore.
      items: true,
        order: { select: { publicNumber: true, email: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    })) as RawReturn;

    // Restock — reason RETURN, orderId from the return's parent order so
    // an admin can trace "why did stock go up on 14 Feb?" back to ABS-1042-R1.
    for (const pair of restockPairs) {
      await applyMovement(tx, {
        variantId: pair.variantId,
        delta: pair.quantity,
        reason: "RETURN",
        orderId: current.orderId,
        actorId: patch?.actorId ?? null,
        actorEmail: patch?.actorEmail ?? null,
        note: `Restocked on return ${current.publicNumber}`,
      });
    }

    return updatedRow;
  });

  return mapRow(updated);
}

/**
 * Customer self-cancel (only while still REQUESTED).
 */
export async function cancelReturnAsCustomer(
  userId: string,
  publicNumber: string,
): Promise<ReturnRow> {
  const current = await getReturnByPublicNumberForUser(userId, publicNumber);
  if (!current) throw new Error("return_not_found");
  if (current.status !== "REQUESTED") {
    throw new Error("return_not_cancellable");
  }

  return transitionReturnStatus(current.id, "CANCELLED");
}
