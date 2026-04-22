// ─────────────────────────────────────────────────────────────────────────
// Cart types — the shape that flows between server and client.
//
// We expose a flat view-model (CartSummary) rather than raw Prisma shapes
// so the drawer doesn't need to know about junctions, decimal types, or
// locale-resolution logic. The server helpers (lib/cart/cart.ts) do the
// translation once per request.
// ─────────────────────────────────────────────────────────────────────────

export type CartItemView = {
  id: string;                // CartItem.id — stable key for React + mutations
  productId: string;
  variantId: string | null;
  name: string;              // localised product name
  slug: string;              // localised slug, for linking back to the PDP
  imageUrl: string | null;
  volumeMl: number | null;
  variantLabel: string | null; // "50 ml", "Travel size" — null = base product
  unitPriceEur: number;      // in euros, not cents
  quantity: number;
  lineTotalEur: number;      // unitPrice × quantity, pre-computed
};

export type CartSummary = {
  id: string;                // Cart.id
  itemCount: number;         // total units across all lines (shows on the badge)
  lineCount: number;         // number of distinct lines
  subtotalEur: number;
  currency: "EUR";
  items: CartItemView[];
};

/** Empty cart — used before the server has confirmed one exists. */
export const EMPTY_CART_SUMMARY: CartSummary = {
  id: "",
  itemCount: 0,
  lineCount: 0,
  subtotalEur: 0,
  currency: "EUR",
  items: [],
};
