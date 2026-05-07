// ─────────────────────────────────────────────────────────────────────────
// Server action: customer submits a product review from the order detail
// page. Closes the loop on the post-purchase review-request email
// (src/lib/email/review-request.ts), whose CTA brings customers here.
//
// Trust model:
//   • Caller must be authenticated as the order owner — requireCustomer()
//     handles that and the redirect-to-signin.
//   • Order must be DELIVERED. We don't accept reviews for orders still in
//     fulfilment — the review-request email only fires on DELIVERED, and a
//     manually-typed URL into a non-delivered order's review form is not a
//     supported flow.
//   • The productId in the form must be one of the order's line items.
//     This is what makes the review "verified" — the customer demonstrably
//     bought this product. We set isVerified = true on that basis.
//   • One review per (userId, productId). Re-submitting silently returns
//     `already_reviewed` rather than creating a duplicate row.
//
// Moderation:
//   New reviews land with isPublished = false. Sofia approves them in
//   /admin/reviews (#42) before they show on the PDP. Doing publish-on-
//   submit would be faster but exposes the shop to "I'll come back and
//   change my review to one star next week" behaviour and abusive copy.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Locale, OrderStatus } from "@prisma/client";

import { requireCustomer } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMyOrderByNumber } from "@/lib/queries/orders";

/** URL locale ("en") → Prisma Locale enum ("EN"). */
function toPrismaLocale(urlLocale: string): Locale {
  switch (urlLocale.toLowerCase()) {
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

export type SubmitReviewState = {
  ok: boolean;
  /**
   * Translation key suffix under `account.review_form.error.*`. When `ok`
   * is true this is undefined and the form displays the success chip.
   */
  errorCode?:
    | "invalid_input"
    | "invalid_order"
    | "order_not_delivered"
    | "product_not_in_order"
    | "already_reviewed"
    | "rating_out_of_range"
    | "body_too_short"
    | "body_too_long"
    | "internal";
};

const Schema = z.object({
  locale: z.string().min(2).max(5),
  orderNumber: z.string().min(1),
  productId: z.string().uuid(),
  // Comes through formData as a string.
  rating: z.coerce.number().int().min(1).max(5),
  title: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  body: z.string().trim().min(5).max(1500),
});

export async function submitProductReviewAction(
  _prev: SubmitReviewState,
  formData: FormData,
): Promise<SubmitReviewState> {
  // 1. Parse + validate raw input.
  const parsed = Schema.safeParse({
    locale: formData.get("locale"),
    orderNumber: formData.get("orderNumber"),
    productId: formData.get("productId"),
    rating: formData.get("rating"),
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    // Map the most common Zod failures to specific error codes so the form
    // can show a useful message rather than a generic "invalid input".
    const issues = parsed.error.issues;
    if (issues.some((i) => i.path.includes("rating"))) {
      return { ok: false, errorCode: "rating_out_of_range" };
    }
    if (
      issues.some(
        (i) => i.path.includes("body") && i.code === "too_small",
      )
    ) {
      return { ok: false, errorCode: "body_too_short" };
    }
    if (
      issues.some(
        (i) => i.path.includes("body") && i.code === "too_big",
      )
    ) {
      return { ok: false, errorCode: "body_too_long" };
    }
    return { ok: false, errorCode: "invalid_input" };
  }

  const { locale, orderNumber, productId, rating, title, body } =
    parsed.data;

  // 2. Authenticate as the order owner. Redirects to sign-in if not.
  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/orders/${orderNumber}`,
  });

  // 3. Resolve the order and verify ownership + status + product membership.
  const order = await getMyOrderByNumber(profile.id, orderNumber, locale);
  if (!order) {
    return { ok: false, errorCode: "invalid_order" };
  }
  if (order.status !== OrderStatus.DELIVERED) {
    return { ok: false, errorCode: "order_not_delivered" };
  }
  const owns = order.items.some((it) => it.productId === productId);
  if (!owns) {
    return { ok: false, errorCode: "product_not_in_order" };
  }

  // 4. One review per (userId, productId). Silent no-op on retry.
  const existing = await prisma.review.findFirst({
    where: { userId: profile.id, productId },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, errorCode: "already_reviewed" };
  }

  // 5. Persist. isVerified=true because we just confirmed the customer
  // bought this product. isPublished=false → goes to admin moderation.
  // We also denormalise the display name into `authorName` so the
  // public PDP renderer doesn't have to join through User — the same
  // column is used by guest-submitted reviews, so rendering stays
  // uniform across both flows.
  const first = profile.firstName?.trim() ?? "";
  const last = profile.lastName?.trim() ?? "";
  let authorName: string | null = null;
  if (first && last) authorName = `${first} ${last[0]}.`;
  else if (first) authorName = first;
  else if (last) authorName = last;

  try {
    await prisma.review.create({
      data: {
        productId,
        userId: profile.id,
        authorName,
        rating,
        title,
        body,
        isVerified: true,
        isPublished: false,
        locale: toPrismaLocale(locale),
      },
    });
  } catch (err) {
    console.error("[review:submit] failed to create review", err);
    return { ok: false, errorCode: "internal" };
  }

  // Refresh the order detail page so the form flips to its "submitted"
  // state on next render. The PDP doesn't need invalidation — the review
  // is still pending moderation and won't appear there yet.
  revalidatePath(`/${locale}/account/orders/${orderNumber}`);

  return { ok: true };
}
