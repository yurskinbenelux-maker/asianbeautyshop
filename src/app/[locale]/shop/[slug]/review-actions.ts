// ─────────────────────────────────────────────────────────────────────────
// Server action: PUBLIC review submission from the PDP.
//
// Counterpart to ../../account/orders/[number]/review-actions.ts which
// handles the verified-purchase flow. The split is intentional: the
// trust models are different.
//
// Trust model:
//   • No auth required. Anyone can submit.
//   • isVerified = false → these reviews never get the "Verified
//     purchase" badge on the PDP. The badge stays meaningful: it only
//     ever signals "this person actually bought the product".
//   • isPublished = false → every public review goes through an admin's
//     moderation queue at /admin/reviews. Spam, duplicates, and abuse
//     get filtered there. The cost: reviews don't appear instantly.
//     The benefit: zero moderation = a brand-killing problem on a
//     boutique skincare shop, so we always moderate.
//
// Anti-spam:
//   1. Honeypot field "_company" — bots fill it, humans don't see it.
//      Submission with anything in there is silently dropped (we still
//      return ok:true so the bot doesn't learn).
//   2. Zod min-length on body (10 chars) — kills "asdf" submissions.
//   3. Per-product per-name dedup window — same name posting to the
//      same product within 60s gets ignored. Cheap throttle without
//      needing Redis.
//
// Capture surface:
//   We capture authorName + optional authorEmail. Email is never
//   displayed on the PDP — only an admin sees it in the moderation
//   queue, used to follow up if a review needs clarification. Locale
//   is captured for the moderator's benefit, not for filtering on
//   display (the PDP shows all reviews regardless of locale per
//   an admin's request — a French shopper still sees Dutch reviews).
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { z } from "zod";
import { Locale } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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

export type SubmitPublicReviewState = {
  ok: boolean;
  /** Translation key suffix under `pdp.review_form.error.*`. */
  errorCode?:
    | "invalid_input"
    | "product_not_found"
    | "duplicate"
    | "internal";
};

const Schema = z.object({
  locale: z.string().min(2).max(5),
  productId: z.string().uuid(),
  authorName: z.string().trim().min(2).max(80),
  // Email is optional. When provided we validate it but never display it.
  authorEmail: z
    .string()
    .trim()
    .email()
    .max(120)
    .optional()
    .or(z.literal("")),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  body: z.string().trim().min(10).max(2000),
  // Honeypot — hidden from real users via `display:none`. Any value
  // means a bot filled the form.
  _company: z.string().max(120).optional().or(z.literal("")),
});

export async function submitPublicReviewAction(
  _prev: SubmitPublicReviewState,
  formData: FormData,
): Promise<SubmitPublicReviewState> {
  const parsed = Schema.safeParse({
    locale: formData.get("locale"),
    productId: formData.get("productId"),
    authorName: formData.get("authorName"),
    authorEmail: formData.get("authorEmail") ?? "",
    rating: formData.get("rating"),
    title: formData.get("title") ?? "",
    body: formData.get("body"),
    _company: formData.get("_company") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, errorCode: "invalid_input" };
  }

  // Honeypot trip → pretend success and bail. Bots that get an error
  // back retry harder; bots that get an "ok" back move on.
  if (parsed.data._company && parsed.data._company.trim().length > 0) {
    return { ok: true };
  }

  const {
    locale,
    productId,
    authorName,
    authorEmail,
    rating,
    title,
    body,
  } = parsed.data;

  // Confirm the product exists. We don't want orphaned reviews from
  // someone hitting the action with a fabricated UUID. (Product.slug
  // doesn't exist on the base model — it's per-locale on
  // ProductTranslation — so we just verify the id resolves.)
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    return { ok: false, errorCode: "product_not_found" };
  }

  // Cheap dedup: same author name posting to the same product within
  // the last 60 seconds = treat as a double-submit and silently
  // succeed. Doesn't catch determined bots but catches the common
  // accidental-double-click case without a backing store.
  const recent = await prisma.review.findFirst({
    where: {
      productId,
      authorName: { equals: authorName, mode: "insensitive" },
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
    select: { id: true },
  });
  if (recent) {
    return { ok: true };
  }

  try {
    await prisma.review.create({
      data: {
        productId,
        userId: null,
        authorName,
        authorEmail: authorEmail && authorEmail.length > 0 ? authorEmail : null,
        rating,
        title: title && title.length > 0 ? title : null,
        body,
        isVerified: false,
        isPublished: false,
        locale: toPrismaLocale(locale),
      },
    });
  } catch (err) {
    console.error("[review:public] failed to create review", err);
    return { ok: false, errorCode: "internal" };
  }

  // No revalidation needed — the new review is isPublished:false so
  // it can't appear on the public PDP until an admin approves it. The
  // PDP cache stays valid.
  return { ok: true };
}
