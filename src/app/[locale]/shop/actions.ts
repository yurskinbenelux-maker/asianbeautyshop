// ─────────────────────────────────────────────────────────────────────────
// Server actions for the /shop page.
//
// Infinite scroll pages through getShopProducts with a `skip` cursor and
// the same filter args the server-rendered first page used. The client
// re-fetches whenever the sentinel comes into view until we've loaded
// `total` rows.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import {
  getShopProducts,
  type ProductCardData,
  type ShopSort,
  type ShopFilterArgs,
} from "@/lib/queries/products";

export type LoadMoreArgs = {
  locale: string;
  sort: ShopSort;
  skip: number;
  take: number;
} & ShopFilterArgs;

export async function loadMoreShopProducts(
  args: LoadMoreArgs,
): Promise<{ items: ProductCardData[]; total: number }> {
  return getShopProducts(args);
}
