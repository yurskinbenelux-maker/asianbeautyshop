// ─────────────────────────────────────────────────────────────────────────
// Wishlist server actions — used by:
//   • heart toggle on product cards / PDPs
//   • "remove" button on /[locale]/account/wishlist
//
// The toggle returns the new state so the client can update instantly.
// If the caller isn't signed in we return a sentinel { needsSignIn: true }
// so the client can redirect to /[locale]/sign-in?next=… instead of
// silently failing.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth";
import {
  toggleMyWishlist,
  removeFromMyWishlist,
} from "@/lib/queries/wishlist";

const ToggleSchema = z.object({
  productId: z.string().uuid(),
  locale: z.string().min(2).max(2),
});

export type ToggleResult =
  | { ok: true; wishlisted: boolean }
  | { ok: false; needsSignIn: true; nextUrl: string }
  | { ok: false; error: "invalid" };

export async function toggleWishlistAction(input: {
  productId: string;
  locale: string;
  returnTo?: string;
}): Promise<ToggleResult> {
  const parsed = ToggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { productId, locale } = parsed.data;

  const current = await getCurrentCustomer();
  if (!current) {
    const next = encodeURIComponent(input.returnTo ?? `/${locale}`);
    return {
      ok: false,
      needsSignIn: true,
      nextUrl: `/${locale}/sign-in?next=${next}`,
    };
  }

  const result = await toggleMyWishlist(current.profile.id, productId);

  revalidatePath(`/${locale}/account/wishlist`);
  return { ok: true, wishlisted: result.wishlisted };
}

/** Form-action variant used on the wishlist page itself. */
export async function removeWishlistFormAction(
  formData: FormData,
): Promise<void> {
  const productId = formData.get("productId");
  const locale = formData.get("locale");
  if (
    typeof productId !== "string" ||
    typeof locale !== "string" ||
    !productId ||
    !locale
  ) {
    return;
  }

  const current = await getCurrentCustomer();
  if (!current) return;

  await removeFromMyWishlist(current.profile.id, productId);
  revalidatePath(`/${locale}/account/wishlist`);
}
