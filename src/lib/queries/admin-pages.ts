// ─────────────────────────────────────────────────────────────────────────
// Admin static pages — read queries.
//
// One row per key (e.g. "about", "faq", "shipping"). Each key has up to
// 4 translations. The public site falls back to EN when a language is
// missing, so EN is required for every page.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import type { Locale } from "@prisma/client";

export type PageRow = {
  id: string;
  key: string;
  isActive: boolean;
  titleEn: string | null;
  translationCount: number;
  updatedAt: Date;
};

export type PageTranslationInput = {
  locale: Locale;
  title: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
};

export type PageDetail = {
  id: string;
  key: string;
  isActive: boolean;
  translations: Record<Locale, PageTranslationInput>;
};

export async function listAdminPages(): Promise<PageRow[]> {
  const rows = await prisma.page.findMany({
    orderBy: { key: "asc" },
    include: {
      translations: {
        select: { locale: true, title: true },
      },
    },
  });

  return rows.map((p) => {
    const en = p.translations.find((t) => t.locale === "EN");
    return {
      id: p.id,
      key: p.key,
      isActive: p.isActive,
      titleEn: en?.title ?? null,
      translationCount: p.translations.length,
      updatedAt: p.updatedAt,
    };
  });
}

export async function getAdminPageByKey(key: string): Promise<PageDetail | null> {
  const p = await prisma.page.findUnique({
    where: { key },
    include: { translations: true },
  });
  if (!p) return null;

  const byLocale: Record<Locale, PageTranslationInput> = {
    EN: empty("EN"),
    NL: empty("NL"),
    FR: empty("FR"),
    RU: empty("RU"),
  };
  for (const t of p.translations) {
    byLocale[t.locale] = {
      locale: t.locale,
      title: t.title ?? "",
      body: t.body ?? "",
      seoTitle: t.seoTitle ?? "",
      seoDescription: t.seoDescription ?? "",
    };
  }
  return {
    id: p.id,
    key: p.key,
    isActive: p.isActive,
    translations: byLocale,
  };
}

function empty(locale: Locale): PageTranslationInput {
  return {
    locale,
    title: "",
    body: "",
    seoTitle: "",
    seoDescription: "",
  };
}
