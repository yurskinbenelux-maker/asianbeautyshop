// ─────────────────────────────────────────────────────────────────────────
// Cart server actions — the client-facing mutation surface.
//
// Thin wrappers around lib/cart/cart.ts. They exist to:
//   · be "use server" entry points the client can call directly
//   · map a Locale prefix string from the URL to the Prisma Locale enum
//   · call revalidatePath so the Nav badge (server-rendered) updates
//
// Return shape is { ok, cart, message }. The client uses `cart` to update
// its local state optimistically after each mutation.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { Locale } from "@prisma/client";
import {
  addItem,
  removeItem,
  updateItemQuantity,
  peekCartSummary,
} from "./cart";
import type { CartSummary } from "./types";
import type { GiftCardConfig } from "@/lib/gift-cards/types";

export type CartActionResult = {
  ok: boolean;
  cart: CartSummary;
  message?: string;
};

/**
 * Translate the lower-case URL locale ("en" | "nl" | "fr" | "ru") into
 * the Prisma enum. Unknown / missing defaults to EN.
 */
function toPrismaLocale(urlLocale: string | null | undefined): Locale {
  switch ((urlLocale ?? "").toLowerCase()) {
    case "nl":
      return Locale.NL;
    case "fr":
      return Locale.FR;
    case "ru":
      return Locale.RU;
    default:
      return Locale.EN;
  }
}

/** Fetch the current cart without mutating anything. */
export async function getCartAction(
  urlLocale?: string,
): Promise<CartSummary> {
  return peekCartSummary({ locale: toPrismaLocale(urlLocale) });
}

/**
 * Add a product (optionally a variant) to the cart.
 *
 * For gift cards, pass `giftCardConfig` with at minimum
 * `{ deliveryMode, recipientEmail }`. Omitting it on a GIFT_CARD product
 * throws — that's intentional, the PDP form should always supply it.
 */
export async function addToCartAction(input: {
  productId: string;
  variantId?: string | null;
  quantity?: number;
  urlLocale?: string;
  giftCardConfig?: GiftCardConfig | null;
}): Promise<CartActionResult> {
  try {
    const cart = await addItem({
      productId: input.productId,
      variantId: input.variantId ?? null,
      quantity: input.quantity ?? 1,
      locale: toPrismaLocale(input.urlLocale),
      giftCardConfig: input.giftCardConfig ?? null,
    });
    // Revalidate every localised layout so the header badge updates.
    revalidatePath("/", "layout");
    return { ok: true, cart };
  } catch (err) {
    return {
      ok: false,
      cart: await peekCartSummary({
        locale: toPrismaLocale(input.urlLocale),
      }),
      message:
        err instanceof Error ? err.message : "Couldn't add to cart.",
    };
  }
}

/** Update the quantity of one line. Quantity 0 removes the line. */
export async function updateCartQtyAction(input: {
  cartItemId: string;
  quantity: number;
  urlLocale?: string;
}): Promise<CartActionResult> {
  try {
    const cart = await updateItemQuantity({
      cartItemId: input.cartItemId,
      quantity: input.quantity,
      locale: toPrismaLocale(input.urlLocale),
    });
    revalidatePath("/", "layout");
    return { ok: true, cart };
  } catch (err) {
    return {
      ok: false,
      cart: await peekCartSummary({
        locale: toPrismaLocale(input.urlLocale),
      }),
      message: err instanceof Error ? err.message : "Couldn't update cart.",
    };
  }
}

/** Remove one line entirely. */
export async function removeFromCartAction(input: {
  cartItemId: string;
  urlLocale?: string;
}): Promise<CartActionResult> {
  try {
    const cart = await removeItem({
      cartItemId: input.cartItemId,
      locale: toPrismaLocale(input.urlLocale),
    });
    revalidatePath("/", "layout");
    return { ok: true, cart };
  } catch (err) {
    return {
      ok: false,
      cart: await peekCartSummary({
        locale: toPrismaLocale(input.urlLocale),
      }),
      message: err instanceof Error ? err.message : "Couldn't remove line.",
    };
  }
}
