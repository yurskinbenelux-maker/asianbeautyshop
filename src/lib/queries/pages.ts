// ─────────────────────────────────────────────────────────────────────────
// Pages query layer — fetches a single static page (privacy, terms, etc.)
// by key + locale, with an EN fallback so the site never 404s a legal URL
// just because a translation is missing.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** The fixed set of page keys an admin can edit. Keeping this constrained to a
 * union (rather than accepting arbitrary slugs) means a typo in the URL
 * 404s cleanly instead of scanning the Page table. */
export const LEGAL_PAGE_KEYS = [
  "privacy",
  "terms",
  "cookies",
  "returns",
  "imprint",
] as const;
export type LegalPageKey = (typeof LEGAL_PAGE_KEYS)[number];

export function isLegalPageKey(v: string): v is LegalPageKey {
  return (LEGAL_PAGE_KEYS as readonly string[]).includes(v);
}

/** Translate URL locale → Prisma Locale enum. */
export function urlLocaleToPrisma(urlLocale: string): Locale {
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

export type PageView = {
  key: LegalPageKey;
  title: string;
  bodyHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  isFallback: boolean; // true when we had to fall back to EN
  updatedAt: Date;
};

/**
 * Fetch a legal page by key + URL locale. Returns null if the page does not
 * exist at all (e.g. key is valid but an admin archived it). Falls back to the
 * EN translation if the requested locale is missing so we never ship an
 * empty legal page.
 */
export async function getLegalPage({
  key,
  locale,
}: {
  key: LegalPageKey;
  locale: string;
}): Promise<PageView | null> {
  const prismaLocale = urlLocaleToPrisma(locale);

  const page = await prisma.page.findUnique({
    where: { key },
    select: {
      key: true,
      isActive: true,
      updatedAt: true,
      translations: {
        where: {
          // grab the requested locale + EN in one round-trip so we can pick
          // the best available without a second query
          locale: { in: [prismaLocale, Locale.EN] },
        },
        select: {
          locale: true,
          title: true,
          body: true,
          seoTitle: true,
          seoDescription: true,
        },
      },
    },
  });

  if (!page || !page.isActive) return null;

  const requested = page.translations.find((t) => t.locale === prismaLocale);
  const fallback = page.translations.find((t) => t.locale === Locale.EN);
  const chosen = requested ?? fallback;
  if (!chosen) return null;

  return {
    key: page.key as LegalPageKey,
    title: chosen.title,
    bodyHtml: chosen.body,
    seoTitle: chosen.seoTitle,
    seoDescription: chosen.seoDescription,
    isFallback: !requested && !!fallback,
    updatedAt: page.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// getStaticPage — same contract as getLegalPage, but for editorial /
// content pages that aren't in the fixed LEGAL_PAGE_KEYS union (e.g.
// "about", "faq", "shipping"). Used by /[locale]/about and any future
// content routes.
//
// EN fallback kicks in for locales an admin hasn't translated yet — the UI
// surfaces this via `isFallback` so users know they're seeing the EN copy.
// ─────────────────────────────────────────────────────────────────────────
export type StaticPageView = Omit<PageView, "key"> & { key: string };

export async function getStaticPage({
  key,
  locale,
}: {
  key: string;
  locale: string;
}): Promise<StaticPageView | null> {
  const prismaLocale = urlLocaleToPrisma(locale);

  const page = await prisma.page.findUnique({
    where: { key },
    select: {
      key: true,
      isActive: true,
      updatedAt: true,
      translations: {
        where: { locale: { in: [prismaLocale, Locale.EN] } },
        select: {
          locale: true,
          title: true,
          body: true,
          seoTitle: true,
          seoDescription: true,
        },
      },
    },
  });

  if (!page || !page.isActive) return null;

  const requested = page.translations.find((t) => t.locale === prismaLocale);
  const fallback = page.translations.find((t) => t.locale === Locale.EN);
  const chosen = requested ?? fallback;
  if (!chosen) return null;

  return {
    key: page.key,
    title: chosen.title,
    bodyHtml: chosen.body,
    seoTitle: chosen.seoTitle,
    seoDescription: chosen.seoDescription,
    isFallback: !requested && !!fallback,
    updatedAt: page.updatedAt,
  };
}
