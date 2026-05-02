// ─────────────────────────────────────────────────────────────────────────
// orderRequiresShipping — single source of truth for "does this order
// have anything physical in it?"
//
// Returns true when at least one OrderItem points at a product whose
// `kind !== GIFT_CARD`. Used by:
//   · Sendcloud sync — early-return on digital-only orders
//   · Order-confirmation email — branch the body copy
//   · Order-shipped email + admin "Mark shipped" action — refuse digital
//   · Admin order detail page — hide the Shipping panel
//
// We deliberately re-derive this from the OrderItems instead of caching
// a flag on Order so a future product-kind change doesn't leave stale
// state behind.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { ProductKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function orderRequiresShipping(
  orderId: string,
): Promise<boolean> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { product: { select: { kind: true } } },
  });
  if (items.length === 0) return false;
  return items.some((i) => i.product.kind !== ProductKind.GIFT_CARD);
}

/**
 * Synchronous variant — used when the caller has already loaded items.
 * Avoids a second DB round-trip from server pages that already include
 * `items: { include: { product: true } }`.
 */
export function itemsRequireShipping(
  items: Array<{ product: { kind: ProductKind } }>,
): boolean {
  if (items.length === 0) return false;
  return items.some((i) => i.product.kind !== ProductKind.GIFT_CARD);
}
