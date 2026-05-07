// ─────────────────────────────────────────────────────────────────────────
// /[locale]/journal/[slug] — single journal post.
//
// The slug is locale-specific, same shape as PDPs. getJournalPostBySlug
// does the (locale, slug) lookup and returns the slugsByLocale map we
// need to feed both:
//   · buildPageMetadataPerLocale — so hreflang points each locale at its
//     translated URL (Google/Yandex).
//   · LocaleAlternatesProvider   — so the in-page LocaleSwitcher lands
//     on the right translated URL when the user flips language.
//
// Article JSON-LD: emit Article with datePublished / dateModified / author,
// same pattern as PDPs. The Article type is widely supported by search
// engines and keeps options open for future rich results (reading time,
// pub date stars, etc.).
// ─────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import { maybeRedirect } from "@/lib/redirects/maybe-redirect";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getJournalPostBySlug } from "@/lib/queries/journal";
import { priceLocale } from "@/lib/utils";
import { buildPageMetadataPerLocale } from "@/lib/seo/metadata";
import { canonicalFor } from "@/lib/seo/metadata";
import { LocaleAlternatesProvider } from "@/components/layout/locale-alternates";
import { JsonLd } from "@/components/seo/json-ld";
import { siteOrigin, siteName } from "@/lib/seo/json-ld";
import { Locale as PrismaLocale } from "@prisma/client";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getJournalPostBySlug(locale, slug);
  if (!post) return {};

  // Build per-locale tails from the slugsByLocale map. Any locale that
  // isn't translated falls back to the EN slug — never to "this" locale,
  // which would create a hreflang loop pointing at a 404.
  const enSlug = post.slugsByLocale[PrismaLocale.EN] ?? slug;
  const perLocaleTail: Partial<Record<"en" | "nl" | "fr" | "ru", string>> = {};
  for (const [loc, s] of Object.entries(post.slugsByLocale)) {
    if (!s) continue;
    perLocaleTail[loc.toLowerCase() as keyof typeof perLocaleTail] =
      `/journal/${s}`;
  }
  for (const loc of ["en", "nl", "fr", "ru"] as const) {
    if (!perLocaleTail[loc]) perLocaleTail[loc] = `/journal/${enSlug}`;
  }

  return buildPageMetadataPerLocale({
    locale,
    perLocaleTail,
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt ?? undefined,
    ogImage: post.coverUrl,
    ogType: "article",
  });
}

export default async function JournalPostPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const post = await getJournalPostBySlug(locale, slug);
  if (!post) {
    await maybeRedirect(locale, `/journal/${slug}`);
    notFound();
  }

  const t = await getTranslations("journal");

  // Pretty-print publish date in the user's locale — nothing clever, just
  // "12 April 2026" / "12 avril 2026" / etc.
  const dateFmt = new Intl.DateTimeFormat(priceLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Map the slugsByLocale dictionary (uppercase enum) onto the lowercase
  // URL-locale keys the LocaleSwitcher understands.
  const localeAlternates: Record<string, string> = {};
  for (const [loc, slugForLocale] of Object.entries(post.slugsByLocale)) {
    if (slugForLocale) {
      localeAlternates[loc.toLowerCase()] = `/journal/${slugForLocale}`;
    }
  }

  // ── Article JSON-LD ────────────────────────────────────────
  // Emit Article (not BlogPosting — Article is the more generic and
  // widely-supported schema.org type for editorial content; avoids
  // implying a release cadence we don't promise).
  const canonical = canonicalFor(locale, `/journal/${post.slug}`);
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.coverUrl ? [post.coverUrl] : undefined,
    datePublished: post.publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: post.authorName
      ? { "@type": "Person", name: post.authorName }
      : { "@type": "Organization", name: siteName() },
    publisher: { "@id": `${siteOrigin()}/#organization` },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    inLanguage: locale,
  };

  return (
    <LocaleAlternatesProvider alternates={localeAlternates}>
      <JsonLd data={articleLd} />
      <article className="pb-24">
        {/* ── breadcrumb ─────────────────────────────────────── */}
        <div className="container pt-10">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid"
          >
            <Link href="/journal" className="transition-colors hover:text-ink">
              {t("eyebrow")}
            </Link>
            <span aria-hidden>·</span>
            <span className="text-ink">{post.title}</span>
          </nav>
        </div>

        {/* ── hero ───────────────────────────────────────────── */}
        <header className="container mt-10 max-w-3xl md:mt-16">
          <div className="eyebrow">
            {post.authorName ?? t("eyebrow")} · {dateFmt.format(post.publishedAt)}
          </div>
          <h1 className="mt-4 font-display text-display-lg leading-[1.05] text-ink">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mt-6 text-[17px] leading-relaxed text-ink-mid">
              {post.excerpt}
            </p>
          )}
        </header>

        {/* ── hero image (edge-to-edge, 16:9) ──────────────────
            Prefer `heroUrl` (uploaded specifically for the article
            page at landscape ratio). Fall back to `coverUrl` so old
            articles published before the heroUrl field existed still
            render an image — they just get the same crop they used
            to. */}
        {(post.heroUrl ?? post.coverUrl) && (
          <div className="container mt-12">
            {/* next/image would require remotePatterns pre-declared; for
                now the <img> tag matches the rest of the site's editorial
                image handling.

                Frame stays a fixed 16:9 so the page rhythm holds, but
                `object-contain` shows the WHOLE image inside instead of
                cropping when an admin (or anyone) uploads a portrait into
                the hero slot. The cream `bg-rice-dim` lets the
                letterboxing read as intentional editorial framing. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.heroUrl ?? post.coverUrl ?? ""}
              alt={post.title}
              className="aspect-[16/9] w-full bg-rice-dim object-contain"
            />
          </div>
        )}

        {/* ── body (rich HTML from Tiptap) ───────────────────── */}
        <div className="container mt-16 max-w-3xl">
          <div
            className="prose-editorial text-[17px] leading-[1.8] text-ink"
            dangerouslySetInnerHTML={{ __html: post.body }}
          />
        </div>

        {/* ── back to journal (soft landing) ─────────────────── */}
        <div className="container mt-24 flex justify-center">
          <Link
            href="/journal"
            className="text-[12px] uppercase tracking-label text-ink-mid underline decoration-vermilion underline-offset-8 transition-colors hover:text-ink"
          >
            ← {t("back_to_journal")}
          </Link>
        </div>
      </article>
    </LocaleAlternatesProvider>
  );
}
