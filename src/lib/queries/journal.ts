// ─────────────────────────────────────────────────────────────────────────
// Public journal queries — homepage teaser + (future) /journal index.
//
// Only PUBLISHED posts with a publishedAt in the past are returned. We
// prefer a translation in the user's locale and fall back to EN so a post
// published only in English still shows on NL/FR/RU pages.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { Locale, PostStatus } from "@prisma/client";

export type JournalTeaserCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  authorName: string | null;
  publishedAt: Date;
};

/**
 * Top `take` most recent published posts, in the caller's locale (with EN
 * fallback for missing translations). Returns an empty array if nothing is
 * published yet — callers should render a graceful empty/placeholder state.
 */
export async function getJournalTeasers(
  urlLocale: string,
  take = 3,
): Promise<JournalTeaserCard[]> {
  const locale = urlLocale.toUpperCase() as Locale;

  const posts = await prisma.journalPost.findMany({
    where: {
      status: PostStatus.PUBLISHED,
      publishedAt: { lte: new Date() },
    },
    orderBy: { publishedAt: "desc" },
    take,
    include: {
      translations: {
        where: { locale: { in: [locale, Locale.EN] } },
        select: {
          locale: true,
          title: true,
          slug: true,
          excerpt: true,
        },
      },
    },
  });

  const out: JournalTeaserCard[] = [];
  for (const p of posts) {
    // Prefer requested locale, fall back to EN. If neither exists, skip the
    // post entirely — there's nothing sensible to render.
    const tr =
      p.translations.find((t) => t.locale === locale) ??
      p.translations.find((t) => t.locale === Locale.EN);
    if (!tr || !p.publishedAt) continue;

    out.push({
      id: p.id,
      slug: tr.slug,
      title: tr.title,
      excerpt: tr.excerpt,
      coverUrl: p.coverUrl,
      authorName: p.authorName,
      publishedAt: p.publishedAt,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Public /journal listing — every published post, newest first.
// Re-uses the JournalTeaserCard shape so cards render identically between
// the homepage strip and the full listing page.
// ─────────────────────────────────────────────────────────────────────────
export async function listPublishedJournalPosts(
  urlLocale: string,
): Promise<JournalTeaserCard[]> {
  // 100 posts is more than enough until we need pagination. If an admin ever
  // blows past this we'll pageinate; for now, simpler is better.
  return getJournalTeasers(urlLocale, 100);
}

// ─────────────────────────────────────────────────────────────────────────
// Single post by slug, in a specific locale. We deliberately scope the
// lookup to THIS locale's slug — that way /fr/journal/ginseng-slowly (an
// EN slug) won't collide with a French post that genuinely uses the
// French slug. When the lookup fails the page should 404.
//
// The `slugsByLocale` map on the returned record powers the language
// switcher's per-locale hreflang logic (same machinery used for PDPs).
// ─────────────────────────────────────────────────────────────────────────

export type JournalPostDetail = {
  id: string;
  publishedAt: Date;
  updatedAt: Date;
  /** Card thumbnail (4:5). Also used as OG fallback if hero is null. */
  coverUrl: string | null;
  /** Article-page hero (16:9). Detail page does `heroUrl ?? coverUrl`. */
  heroUrl: string | null;
  authorName: string | null;
  title: string;
  excerpt: string | null;
  body: string; // rich HTML, emitted from Tiptap in the admin
  seoTitle: string | null;
  seoDescription: string | null;
  slug: string;
  slugsByLocale: Partial<Record<Locale, string>>;
};

export async function getJournalPostBySlug(
  urlLocale: string,
  slug: string,
): Promise<JournalPostDetail | null> {
  const locale = urlLocale.toUpperCase() as Locale;

  // First: find the JournalPost whose translation for *this* locale has
  // this slug. That guarantees the URL the user typed is the canonical
  // URL in their language.
  const match = await prisma.journalPostTranslation.findFirst({
    where: { locale, slug },
    select: { postId: true },
  });
  if (!match) return null;

  const post = await prisma.journalPost.findFirst({
    where: {
      id: match.postId,
      status: PostStatus.PUBLISHED,
      publishedAt: { lte: new Date() },
    },
    include: {
      translations: true,
    },
  });
  if (!post || !post.publishedAt) return null;

  // Prefer the user's locale translation; fall back to EN for body text
  // if the admin hasn't translated it yet (rare but possible).
  const primary =
    post.translations.find((t) => t.locale === locale) ??
    post.translations.find((t) => t.locale === Locale.EN);
  if (!primary) return null;

  const slugsByLocale: Partial<Record<Locale, string>> = {};
  for (const t of post.translations) slugsByLocale[t.locale] = t.slug;

  return {
    id: post.id,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    coverUrl: post.coverUrl,
    heroUrl: post.heroUrl,
    authorName: post.authorName,
    title: primary.title,
    excerpt: primary.excerpt,
    body: primary.body,
    seoTitle: primary.seoTitle,
    seoDescription: primary.seoDescription,
    slug: primary.slug,
    slugsByLocale,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Sitemap helpers — enumerate every published journal post's per-locale
// slug so src/app/sitemap.ts can emit hreflang alternates. Parallel to
// getAllPublishedProductSlugs (same shape, same fallback strategy).
// ─────────────────────────────────────────────────────────────────────────

export type JournalSitemapEntry = {
  id: string;
  updatedAt: Date;
  publishedAt: Date;
  slugByLocale: Partial<Record<Locale, string>>;
};

export async function getAllPublishedJournalSlugs(): Promise<
  JournalSitemapEntry[]
> {
  const posts = await prisma.journalPost.findMany({
    where: {
      status: PostStatus.PUBLISHED,
      publishedAt: { lte: new Date() },
    },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      updatedAt: true,
      publishedAt: true,
      translations: { select: { locale: true, slug: true } },
    },
  });

  const out: JournalSitemapEntry[] = [];
  for (const p of posts) {
    if (!p.publishedAt) continue;
    const slugByLocale: Partial<Record<Locale, string>> = {};
    for (const t of p.translations) slugByLocale[t.locale] = t.slug;
    out.push({
      id: p.id,
      updatedAt: p.updatedAt,
      publishedAt: p.publishedAt,
      slugByLocale,
    });
  }
  return out;
}
