// ─────────────────────────────────────────────────────────────────────────
// Inventory movements — helpers for recording stock changes.
//
// Two patterns:
//
//   1. recordMovement(tx, { variantId, delta, reason, ... })
//      Records the log row only; caller has already applied the delta to
//      ProductVariant.stock inside the same transaction. Use this from
//      existing code paths that already touch .stock atomically.
//
//   2. applyMovement(tx, { variantId, delta, reason, ... })
//      Convenience: mutates ProductVariant.stock AND writes the log row
//      in one go. Use for new code paths that don't already manipulate
//      stock themselves.
//
// Both helpers clamp negative stock to 0 — we never want negative stock
// rows (overselling is a UX bug to fix upstream, not something the log
// should lie about).
// ─────────────────────────────────────────────────────────────────────────

import type { Prisma } from "@prisma/client";

type TxLike = Prisma.TransactionClient | {
  productVariant: Prisma.TransactionClient["productVariant"];
  inventoryMovement: Prisma.TransactionClient["inventoryMovement"];
};

export type MovementReason =
  | "SALE"
  | "CANCEL"
  | "REFUND"
  | "RETURN"
  | "ADJUSTMENT"
  | "CSV_IMPORT"
  | "INITIAL"
  | "OTHER";

export type MovementInput = {
  variantId: string;
  delta: number; // signed: +5 adds stock, -2 removes
  reason: MovementReason;
  orderId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  note?: string | null;
  /**
   * Pass the new stock value if the caller has ALREADY updated .stock on
   * the variant row. If omitted, `recordMovement` queries the variant to
   * snapshot `stockAfter`. Cheap — PK lookup.
   */
  stockAfter?: number;
};

/**
 * Record a movement — caller already changed the variant's stock.
 * Pass the same `tx` that did the stock update so the two writes commit
 * together (or fail together).
 */
export async function recordMovement(
  tx: TxLike,
  input: MovementInput,
): Promise<void> {
  let stockAfter = input.stockAfter;
  if (stockAfter == null) {
    const row = await tx.productVariant.findUnique({
      where: { id: input.variantId },
      select: { stock: true },
    });
    stockAfter = row?.stock ?? 0;
  }

  await tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      delta: Math.trunc(input.delta),
      stockAfter,
      reason: input.reason,
      orderId: input.orderId ?? null,
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      note: input.note ?? null,
    },
  });
}

/**
 * Apply a delta to the variant's stock AND log the movement in one step.
 * Clamps stock at 0 — the recorded delta becomes whatever was actually
 * removable (so log totals always match the stock value).
 */
export async function applyMovement(
  tx: TxLike,
  input: MovementInput,
): Promise<{ stockAfter: number; appliedDelta: number }> {
  const variant = await tx.productVariant.findUnique({
    where: { id: input.variantId },
    select: { stock: true },
  });
  if (!variant) {
    throw new Error(`Variant ${input.variantId} not found`);
  }

  const current = variant.stock;
  const requested = Math.trunc(input.delta);
  // Clamp: can't go below 0.
  const next = Math.max(0, current + requested);
  const applied = next - current;

  if (applied === 0) {
    // No-op — don't log a zero-delta row.
    return { stockAfter: current, appliedDelta: 0 };
  }

  await tx.productVariant.update({
    where: { id: input.variantId },
    data: { stock: next },
  });

  await tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      delta: applied,
      stockAfter: next,
      reason: input.reason,
      orderId: input.orderId ?? null,
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      note: input.note ?? null,
    },
  });

  return { stockAfter: next, appliedDelta: applied };
}
