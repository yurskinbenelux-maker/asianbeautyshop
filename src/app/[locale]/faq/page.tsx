// ─────────────────────────────────────────────────────────────────────────
// /[locale]/faq — frequently asked questions.
//
// Admin-editable via /admin/pages (key = "faq"). The seeded body uses
// <h2> for sections and <h3> for individual questions, which matches the
// shape Google's FAQPage rich-result expects — we can attach JSON-LD in
// a follow-up if we want those answer boxes in search results.
//
// Layout mirrors /shipping and /about so the "static page" surfaces feel
// like one coherent editorial family.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getStaticPage } from "@/lib/queries/pages";
import { buildPageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const page = await getStaticPage({ key: "faq", locale });
  if (!page) return {};
  return {
    ...buildPageMetadata({
      locale,
      tail: "/faq",
      title: page.seoTitle ?? page.title,
      description: page.seoDescription ?? undefined,
    }),
    robots: { index: true, follow: true },
  };
}

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const page = await getStaticPage({ key: "faq", locale });
  if (!page) notFound();

  const tLegal = await getTranslations("legal");

  return (
    <article className="container max-w-3xl py-16 md:py-24">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid"
      >
        <Link href="/" className="transition-colors hover:text-ink">
          YU.R
        </Link>
        <span aria-hidden>·</span>
        <span className="text-ink">{page.title}</span>
      </nav>

      <header className="mt-10">
        <div className="eyebrow">Help</div>
        <h1 className="mt-3 font-display text-display-lg leading-tight text-ink">
          {page.title}
        </h1>
      </header>

      <div className="rule my-10" />

      {page.isFallback && (
        <p className="mb-8 text-[13px] text-ink-mid">
          <em>{tLegal("fallback_notice")}</em>
        </p>
      )}

      <div
        className="prose-editorial text-[16px] leading-[1.75] text-ink-mid"
        dangerouslySetInnerHTML={{ __html: page.bodyHtml }}
      />
    </article>
  );
}
