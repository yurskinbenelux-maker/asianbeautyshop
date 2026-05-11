// ─────────────────────────────────────────────────────────────────────────
// CartProvider — the client-side cart context.
//
// Responsibilities:
//   · hold the CartSummary (single source of truth for the drawer + badge)
//   · track drawer open/closed state
//   · expose addItem/updateQty/removeItem that call server actions + patch
//     the local state with the fresh CartSummary returned by each action
//
// Why a provider instead of useSWR / useQuery? The cart is tightly coupled
// to clicks ("add" → drawer opens + badge increments), and the server
// action returns the new state anyway, so there's no remote-source
// invalidation story to manage. One provider, no cache layer.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useLocale } from "next-intl";
import {
  addToCartAction,
  removeFromCartAction,
  updateCartQtyAction,
} from "@/lib/cart/actions";
import type { CartSummary } from "@/lib/cart/types";
import { EMPTY_CART_SUMMARY } from "@/lib/cart/types";
import type { GiftCardConfig } from "@/lib/gift-cards/types";

type CartContextValue = {
  cart: CartSummary;
  isOpen: boolean;
  isPending: boolean;
  lastError: string | null;
  /** Free-shipping threshold in EUR — passed in from the server layout
   *  so the cart drawer can render a "€X to go" progress indicator that
   *  honours an admin's admin overrides. 0 means no threshold configured. */
  freeShippingThresholdEur: number;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  addItem: (args: {
    productId: string;
    variantId?: string | null;
    quantity?: number;
    /** Optional gift-card recipient payload — required for GIFT_CARD products. */
    giftCardConfig?: GiftCardConfig | null;
  }) => Promise<void>;
  updateQty: (cartItemId: string, quantity: number) => Promise<void>;
  removeLine: (cartItemId: string) => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  initialCart,
  freeShippingThresholdEur = 0,
  children,
}: {
  initialCart: CartSummary;
  /** Pulled from getEffectiveSettings().shipping.freeThresholdCents on the
   *  server layout. Default 0 keeps the indicator hidden if not threaded. */
  freeShippingThresholdEur?: number;
  children: ReactNode;
}) {
  const locale = useLocale();
  const [cart, setCart] = useState<CartSummary>(initialCart);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [lastError, setLastError] = useState<string | null>(null);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((v) => !v), []);

  const addItem = useCallback<CartContextValue["addItem"]>(
    async ({ productId, variantId, quantity, giftCardConfig }) => {
      setLastError(null);
      // Wrap in a transition so React can show the pending state
      // (spinner on the button) without blocking input.
      await new Promise<void>((resolve) => {
        startTransition(async () => {
          try {
            const result = await addToCartAction({
              productId,
              variantId,
              quantity,
              urlLocale: locale,
              giftCardConfig: giftCardConfig ?? null,
            });
            setCart(result.cart);
            if (!result.ok && result.message) setLastError(result.message);
            else setIsOpen(true); // open drawer on successful add
          } catch (err) {
            setLastError(
              err instanceof Error ? err.message : "Couldn't add to cart.",
            );
          } finally {
            resolve();
          }
        });
      });
    },
    [locale],
  );

  const updateQty = useCallback<CartContextValue["updateQty"]>(
    async (cartItemId, quantity) => {
      setLastError(null);
      // Optimistic: patch the local cart before the server responds, so
      // the +/- buttons feel instant. Rolled back if the action errors.
      const snapshot = cart;
      const optimistic: CartSummary = {
        ...cart,
        items: cart.items
          .map((i) =>
            i.id === cartItemId
              ? { ...i, quantity, lineTotalEur: roundedLine(i.unitPriceEur, quantity) }
              : i,
          )
          .filter((i) => i.quantity > 0),
      };
      optimistic.itemCount = optimistic.items.reduce(
        (n, i) => n + i.quantity,
        0,
      );
      optimistic.lineCount = optimistic.items.length;
      optimistic.subtotalEur = round2(
        optimistic.items.reduce((s, i) => s + i.lineTotalEur, 0),
      );
      setCart(optimistic);

      startTransition(async () => {
        try {
          const result = await updateCartQtyAction({
            cartItemId,
            quantity,
            urlLocale: locale,
          });
          setCart(result.cart);
          if (!result.ok && result.message) {
            setLastError(result.message);
            setCart(snapshot); // roll back
          }
        } catch (err) {
          setLastError(
            err instanceof Error ? err.message : "Couldn't update cart.",
          );
          setCart(snapshot);
        }
      });
    },
    [cart, locale],
  );

  const removeLine = useCallback<CartContextValue["removeLine"]>(
    async (cartItemId) => {
      setLastError(null);
      const snapshot = cart;
      const optimistic: CartSummary = {
        ...cart,
        items: cart.items.filter((i) => i.id !== cartItemId),
      };
      optimistic.itemCount = optimistic.items.reduce(
        (n, i) => n + i.quantity,
        0,
      );
      optimistic.lineCount = optimistic.items.length;
      optimistic.subtotalEur = round2(
        optimistic.items.reduce((s, i) => s + i.lineTotalEur, 0),
      );
      setCart(optimistic);

      startTransition(async () => {
        try {
          const result = await removeFromCartAction({
            cartItemId,
            urlLocale: locale,
          });
          setCart(result.cart);
          if (!result.ok && result.message) {
            setLastError(result.message);
            setCart(snapshot);
          }
        } catch (err) {
          setLastError(
            err instanceof Error ? err.message : "Couldn't remove line.",
          );
          setCart(snapshot);
        }
      });
    },
    [cart, locale],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      isOpen,
      isPending,
      lastError,
      freeShippingThresholdEur,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      addItem,
      updateQty,
      removeLine,
    }),
    [
      cart,
      isOpen,
      isPending,
      lastError,
      freeShippingThresholdEur,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      addItem,
      updateQty,
      removeLine,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * Read the cart context. Throws if used outside the provider to catch
 * accidental imports in e.g. the admin tree (which doesn't mount the
 * provider). We keep the error crisp so it's easy to diagnose.
 */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error(
      "useCart() used outside <CartProvider>. Make sure the component tree is wrapped at the locale layout.",
    );
  }
  return ctx;
}

/**
 * Convenience read for components that only need the summary, not the
 * mutation functions. (Used by the header badge — avoids re-rendering
 * when mutation callbacks change identity.)
 */
export function useCartSummary(): CartSummary {
  const ctx = useContext(CartContext);
  return ctx?.cart ?? EMPTY_CART_SUMMARY;
}

// ── helpers ──────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function roundedLine(unitPrice: number, qty: number): number {
  return round2(unitPrice * qty);
}
