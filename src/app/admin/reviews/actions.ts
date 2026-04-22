// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/reviews.
//
// Three mutations:
//   • approve (isPublished → true)
//   • unpublish (isPublished → false) — reverses an approval without
//     deleting the customer's words
//   • delete — used for spam / unintelligible / duplicate reviews
//
// Each one revalidates /admin/reviews AND the product detail page so
// customer-visible review state updates without a cache bust.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

async function refresh(productSlug?: string | null) {
  revalidatePath("/admin/reviews");
  if (productSlug) {
    // Cover both locale-prefixed and unprefixed product URLs; the (public)
    // tree uses [locale] so path-bound revalidation handles it via layout.
    revalidatePath(`/shop/${productSlug}`, "layout");
  }
}

async function productSlugFor(reviewId: string): Promise<string | null> {
  const row = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      product: {
        select: {
          translations: { where: { locale: "EN" }, select: { slug: true }, take: 1 },
        },
      },
    },
  });
  return row?.product.translations[0]?.slug ?? null;
}

/** Publish a review so it appears on the product page. */
export async function approveReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.review.update({
    where: { id },
    data: { isPublished: true },
  });
  const slug = await productSlugFor(id);
  await refresh(slug);
}

/** Remove a previously-published review from the public site. */
export async function unpublishReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.review.update({
    where: { id },
    data: { isPublished: false },
  });
  const slug = await productSlugFor(id);
  await refresh(slug);
}

/** Permanently delete a review. Used for spam / unintelligible. */
export async function deleteReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Capture the slug first — after delete the FK is gone.
  const slug = await productSlugFor(id);
  await prisma.review.delete({ where: { id } });
  await refresh(slug);
}
