// ─────────────────────────────────────────────────────────────────────────
// Cart types — the shape that flows between server and client.
//
// We expose a flat view-model (CartSummary) rather than raw Prisma shapes
// so the drawer doesn't need to know about junctions, decimal types, or
// locale-resolution logic. The server helpers (lib/cart/cart.ts) do the
// translation once per request.
// ─────────────────────────────────────────────────────────────────────────

import type { GiftCardConfig } from "@/lib/gift-cards/types";

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
  /**
   * If this line is a gift-card purchase, the per-recipient config. The
   * cart drawer uses it to render "→ recipient@email" instead of variant
   * label, and the order-placement code copies it into OrderItem.giftCardConfig
   * so the Mollie webhook can mint the right GiftCard row. Null on
   * standard products.
   */
  giftCardConfig: GiftCardConfig | null;
  /**
   * False for digital goods (gift cards). The pricing engine checks this
   * across the cart to decide whether to charge shipping at all.
   */
  requiresShipping: boolean;
  /**
   * Per-line discount marker. Populated when the line was added through
   * a flow that grants a fixed % off — currently only the quiz reward
   * (discountReason = "quiz_reward", discountPercent = 15). Standard
   * lines leave both null. Coupon-codes are mutually exclusive with
   * any line that carries a per-line discount. See lib/checkout/pricing.ts.
   */
  discountReason: string | null;
  discountPercent: number | null;
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
