// ─────────────────────────────────────────────────────────────────────────
// Testimonial queries — the homepage "voices" strip.
//
// Sofia curates a small, hand-picked set of quotes (NOT the product reviews
// feed). We keep these independent so she can publish an aspirational quote
// on the homepage without it being tied to a specific purchase.
//
// Public call site: listActiveTestimonials(locale) → ordered array, EN
// fallback per row, ready to render. If the DB is empty the homepage
// falls back to its hardcoded JSON trio (see testimonials.tsx).
//
// Admin call sites: list/get/create/update/delete live in
// src/lib/queries/admin-testimonials.ts (separate file so the bundle
// boundary stays clean — admin shouldn't import from public and vice versa).
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { Locale } from "@prisma/client";

export type TestimonialCard = {
  id: string;
  rating: number;
  verified: boolean;
  quote: string;
  authorName: string;
  productName: string | null;
};

/**
 * All active testimonials, ordered by sortOrder. Each row is resolved to
 * the caller's locale with EN fallback. Rows with no translation at all
 * are skipped (shouldn't happen in practice — the admin form requires EN).
 */
export async function listActiveTestimonials(
  urlLocale: string,
): Promise<TestimonialCard[]> {
  const locale = urlLocale.toUpperCase() as Locale;

  const rows = await prisma.testimonial.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      translations: {
        where: { locale: { in: [locale, Locale.EN] } },
        select: {
          locale: true,
          quote: true,
          authorName: true,
          productName: true,
        },
      },
    },
  });

  const out: TestimonialCard[] = [];
  for (const r of rows) {
    const tr =
      r.translations.find((t) => t.locale === locale) ??
      r.translations.find((t) => t.locale === Locale.EN);
    if (!tr) continue;
    out.push({
      id: r.id,
      rating: r.rating,
      verified: r.verified,
      quote: tr.quote,
      authorName: tr.authorName,
      productName: tr.productName,
    });
  }
  return out;
}
