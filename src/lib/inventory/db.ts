// ─────────────────────────────────────────────────────────────────────────
// Inventory movement queries — read-side helpers for the admin tab.
//
// The main consumer is the product edit page which shows a timeline of
// stock movements grouped by variant.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

export type InventoryRow = {
  id: string;
  variantId: string;
  variantLabel: string;
  variantSku: string;
  delta: number;
  stockAfter: number;
  reason: string;
  orderId: string | null;
  orderNumber: string | null;
  actorEmail: string | null;
  note: string | null;
  createdAt: Date;
};

/**
 * Movements for every variant of a given product, most recent first.
 * Capped at 200 rows — the product page shows a condensed timeline.
 */
export async function listProductMovements(
  productId: string,
): Promise<InventoryRow[]> {
  const rows = (await prisma.inventoryMovement.findMany({
    where: { variant: { productId } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      variantId: true,
      delta: true,
      stockAfter: true,
      reason: true,
      orderId: true,
      actorEmail: true,
      note: true,
      createdAt: true,
      variant: { select: { label: true, sku: true } },
    },
  })) as Array<{
    id: string;
    variantId: string;
    delta: number;
    stockAfter: number;
    reason: string;
    orderId: string | null;
    actorEmail: string | null;
    note: string | null;
    createdAt: Date;
    variant: { label: string; sku: string };
  }>;

  // Resolve order numbers for any rows with an orderId, one roundtrip.
  const orderIds = Array.from(new Set(rows.map((r) => r.orderId).filter(Boolean))) as string[];
  const orderMap = new Map<string, string>();
  if (orderIds.length) {
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, publicNumber: true },
    });
    for (const o of orders) orderMap.set(o.id, o.publicNumber);
  }

  return rows.map((r) => ({
    id: r.id,
    variantId: r.variantId,
    variantLabel: r.variant.label,
    variantSku: r.variant.sku,
    delta: r.delta,
    stockAfter: r.stockAfter,
    reason: r.reason,
    orderId: r.orderId ?? null,
    orderNumber: r.orderId ? orderMap.get(r.orderId) ?? null : null,
    actorEmail: r.actorEmail,
    note: r.note,
    createdAt: r.createdAt,
  }));
}
