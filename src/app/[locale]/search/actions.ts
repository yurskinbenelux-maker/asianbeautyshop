// ─────────────────────────────────────────────────────────────────────────
// Server action for live search — called by the header overlay on
// keystroke (debounced). Thin wrapper around searchProducts so Prisma
// never ships to the client bundle.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { searchProducts, type ProductCardData } from "@/lib/queries/products";

export async function searchProductsLive({
  locale,
  query,
  take = 5,
}: {
  locale: string;
  query: string;
  take?: number;
}): Promise<ProductCardData[]> {
  // Defensive length cap — keep us out of trouble if the client sends
  // something pathologically long. The overlay just needs the ranked
  // items (no facet counts, no pagination), so we unwrap the `items`
  // side of the now-paginated searchProducts return shape.
  const { items } = await searchProducts({
    locale,
    query: query.slice(0, 120),
    take,
  });
  return items;
}
