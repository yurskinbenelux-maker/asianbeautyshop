// ─────────────────────────────────────────────────────────────────────────
// Admin journal posts — read queries.
//
// A post = one JournalPost + up to 4 JournalPostTranslation rows (EN/NL/FR/RU).
// EN is the fallback on the public site when a language is blank.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { Locale, PostStatus } from "@prisma/client";

export type JournalRow = {
  id: string;
  status: PostStatus;
  publishedAt: Date | null;
  coverUrl: string | null;
  authorName: string | null;
  titleEn: string | null;
  slugEn: string | null;
  updatedAt: Date;
};

export type JournalTranslationInput = {
  locale: Locale;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
};

export type JournalDetail = {
  id: string;
  status: PostStatus;
  publishedAt: Date | null;
  /** Card thumbnail (4:5). Used on homepage teaser + /journal listing. */
  coverUrl: string | null;
  /** Article hero (16:9). Used at the top of /journal/[slug]. */
  heroUrl: string | null;
  authorName: string | null;
  translations: Record<Locale, JournalTranslationInput>;
};

export async function listAdminJournal(): Promise<JournalRow[]> {
  const rows = await prisma.journalPost.findMany({
    orderBy: [
      { publishedAt: { sort: "desc", nulls: "first" } },
      { updatedAt: "desc" },
    ],
    include: {
      translations: {
        where: { locale: "EN" },
        select: { title: true, slug: true },
        take: 1,
      },
    },
  });

  return rows.map((p) => ({
    id: p.id,
    status: p.status,
    publishedAt: p.publishedAt,
    coverUrl: p.coverUrl,
    authorName: p.authorName,
    titleEn: p.translations[0]?.title ?? null,
    slugEn: p.translations[0]?.slug ?? null,
    updatedAt: p.updatedAt,
  }));
}

export async function getAdminJournalPost(
  id: string,
): Promise<JournalDetail | null> {
  const p = await prisma.journalPost.findUnique({
    where: { id },
    include: { translations: true },
  });
  if (!p) return null;

  const byLocale: Record<Locale, JournalTranslationInput> = {
    EN: emptyT("EN"),
    NL: emptyT("NL"),
    FR: emptyT("FR"),
    RU: emptyT("RU"),
  };
  for (const t of p.translations) {
    byLocale[t.locale] = {
      locale: t.locale,
      title: t.title ?? "",
      slug: t.slug ?? "",
      excerpt: t.excerpt ?? "",
      body: t.body ?? "",
      seoTitle: t.seoTitle ?? "",
      seoDescription: t.seoDescription ?? "",
    };
  }

  return {
    id: p.id,
    status: p.status,
    publishedAt: p.publishedAt,
    coverUrl: p.coverUrl,
    heroUrl: p.heroUrl,
    authorName: p.authorName,
    translations: byLocale,
  };
}

function emptyT(locale: Locale): JournalTranslationInput {
  return {
    locale,
    title: "",
    slug: "",
    excerpt: "",
    body: "",
    seoTitle: "",
    seoDescription: "",
  };
}
