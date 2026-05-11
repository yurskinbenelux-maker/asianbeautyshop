// ─────────────────────────────────────────────────────────────────────────
// /[locale]/legal/[key] — static legal & information pages.
//
// Renders one of five keys (privacy, terms, cookies, returns, imprint).
// The content lives in Page / PageTranslation, seeded by prisma/seed-legal.ts
// and editable via the admin later. Falls back to EN if the requested
// locale isn't translated yet — getLegalPage handles that.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import {
  getLegalPage,
  isLegalPageKey,
  LEGAL_PAGE_KEYS,
} from "@/lib/queries/pages";
import { buildPageMetadata } from "@/lib/seo/metadata";

type Props = {
  params: Promise<{ locale: string; key: string }>;
};

// Pre-render each legal page at build time: 5 keys × 4 locales = 20 pages.
// Cheap, static, and means the legal pages are served instantly without
// hitting the DB on every page view.
export async function generateStaticParams() {
  const locales = ["en", "nl", "fr", "ru"];
  return locales.flatMap((locale) =>
    LEGAL_PAGE_KEYS.map((key) => ({ locale, key })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, key } = await params;
  if (!isLegalPageKey(key)) return {};
  const page = await getLegalPage({ key, locale });
  if (!page) return {};
  const meta = buildPageMetadata({
    locale,
    tail: `/legal/${key}`,
    // Strip any HTML entities in the title (we use &amp; in seeds)
    title: (page.seoTitle ?? page.title).replace(/&amp;/g, "&"),
    description: page.seoDescription ?? undefined,
  });
  return { ...meta, robots: { index: true, follow: true } };
}

export default async function LegalPage({ params }: Props) {
  const { locale, key } = await params;
  setRequestLocale(locale);

  if (!isLegalPageKey(key)) notFound();
  const page = await getLegalPage({ key, locale });
  if (!page) notFound();

  const tLegal = await getTranslations("legal");
  const tFooter = await getTranslations("footer");

  // Per-locale formatted date: "21 April 2026" in EN, "21 avril 2026" in FR…
  const updatedLabel = new Intl.DateTimeFormat(priceLocaleFor(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(page.updatedAt);

  return (
    <article className="container max-w-3xl py-16 md:py-24">
      {/* ── breadcrumb ─────────────────────────────────────────── */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid"
      >
        <Link href="/" className="transition-colors hover:text-ink">
          Asian Beauty Shop
        </Link>
        <span aria-hidden>·</span>
        <span className="text-ink-mid">{tFooter("legal")}</span>
        <span aria-hidden>·</span>
        <span className="text-ink">{stripEntities(page.title)}</span>
      </nav>

      {/* ── eyebrow + title ────────────────────────────────────── */}
      <header className="mt-10">
        <div className="eyebrow">{tFooter("legal")}</div>
        <h1 className="mt-3 font-display text-display-lg leading-tight text-ink">
          {stripEntities(page.title)}
        </h1>
        <p className="mt-6 text-[12px] uppercase tracking-label text-ink-mid">
          {tLegal("last_updated")} · {updatedLabel}
        </p>
      </header>

      <div className="rule my-10" />

      {/* Locale fallback notice — keeps an admin honest about translation gaps */}
      {page.isFallback && (
        <p className="mb-8 text-[13px] text-ink-mid">
          <em>{tLegal("fallback_notice")}</em>
        </p>
      )}

      {/* ── body ───────────────────────────────────────────────── */}
      <div
        className="prose-editorial text-[16px] leading-[1.75] text-ink-mid"
        dangerouslySetInnerHTML={{ __html: page.bodyHtml }}
      />

      {/* ── cross-link to sibling legal pages ──────────────────── */}
      <div className="rule my-16" />
      <nav
        aria-label="Legal pages"
        className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] uppercase tracking-label text-ink-mid"
      >
        {LEGAL_PAGE_KEYS.filter((k) => k !== key).map((k) => (
          <Link
            key={k}
            href={`/legal/${k}`}
            className="transition-colors hover:text-ink"
          >
            {tLegal(`nav.${k}`)}
          </Link>
        ))}
      </nav>
    </article>
  );
}

/** Turn our seed's literal "&amp;" into "&" for the visible title. */
function stripEntities(s: string): string {
  return s.replace(/&amp;/g, "&");
}

/** Duplicated from lib/utils — avoids importing priceLocale just for dates. */
function priceLocaleFor(urlLocale: string): string {
  switch (urlLocale) {
    case "nl":
      return "nl-BE";
    case "fr":
      return "fr-BE";
    case "ru":
      return "ru-RU";
    default:
      return "en-IE";
  }
}
