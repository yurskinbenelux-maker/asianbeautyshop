// ─────────────────────────────────────────────────────────────────────────
// Admin-side testimonial queries.
//
// Kept in a separate file from src/lib/queries/testimonial.ts (public) so
// the bundle boundary stays clean — public callers never pull in the admin
// helpers, and admin pages never accidentally import the locale-resolving
// `listActiveTestimonials` that assumes a visitor session.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { Locale } from "@prisma/client";

export type AdminTestimonialListRow = {
  id: string;
  sortOrder: number;
  isActive: boolean;
  rating: number;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  translationCount: number;
  // Small preview so the admin list doesn't feel like a wall of IDs.
  quotePreview: string | null;
  authorPreview: string | null;
};

export type AdminTestimonialDetail = {
  id: string;
  sortOrder: number;
  isActive: boolean;
  rating: number;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  translations: Record<
    Locale,
    { quote: string; authorName: string; productName: string } | null
  >;
};

/**
 * Every testimonial, most-recently-updated first by default but sorted
 * primarily by `sortOrder` so an admin controls the homepage order.
 */
export async function listAdminTestimonials(): Promise<
  AdminTestimonialListRow[]
> {
  const rows = await prisma.testimonial.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      translations: {
        select: { locale: true, quote: true, authorName: true },
      },
    },
  });

  return rows.map((r) => {
    // Prefer EN for the preview — that's the required locale and the row
    // an admin is most likely to be reading.
    const en = r.translations.find((t) => t.locale === Locale.EN);
    const any = en ?? r.translations[0];
    return {
      id: r.id,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      rating: r.rating,
      verified: r.verified,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      translationCount: r.translations.length,
      quotePreview: any?.quote ?? null,
      authorPreview: any?.authorName ?? null,
    };
  });
}

/** Edit-form data. Returns null if the row doesn't exist. */
export async function getAdminTestimonial(
  id: string,
): Promise<AdminTestimonialDetail | null> {
  const row = await prisma.testimonial.findUnique({
    where: { id },
    include: {
      translations: {
        select: {
          locale: true,
          quote: true,
          authorName: true,
          productName: true,
        },
      },
    },
  });
  if (!row) return null;

  // Normalise into a dense EN/NL/FR/RU record so the form can index into it
  // without checking for undefined on every access.
  const byLocale: AdminTestimonialDetail["translations"] = {
    EN: null,
    NL: null,
    FR: null,
    RU: null,
  };
  for (const t of row.translations) {
    byLocale[t.locale] = {
      quote: t.quote,
      authorName: t.authorName,
      productName: t.productName ?? "",
    };
  }

  return {
    id: row.id,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    rating: row.rating,
    verified: row.verified,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    translations: byLocale,
  };
}

/**
 * Default sortOrder for a new row — one more than the current max so new
 * testimonials land at the bottom of the list. an admin can reorder by editing
 * the value.
 */
export async function nextTestimonialSortOrder(): Promise<number> {
  const top = await prisma.testimonial.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (top?.sortOrder ?? -1) + 1;
}
