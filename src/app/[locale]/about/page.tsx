// ─────────────────────────────────────────────────────────────────────────
// /[locale]/about — editorial About page for Asian Beauty Shop.
//
// Pulls body copy from the `Page` DB table (key = "about"), same
// infrastructure that powers /legal/*. The body is authored via
// /admin/pages so Sofia can refine wording without a deploy. If the
// requested locale has no translation yet, the EN copy renders and a
// small "translation coming soon" banner appears.
//
// Layout is close to the legal pages (editorial prose, centred column)
// with two additions that are unique to About:
//   · Hero eyebrow with the brand philosophy line
//   · Certifications strip (CPNP · ECAS · Montaji · GMP) — trust signal
//     surfacing the regulatory compliance the HQ doc calls out.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getStaticPage } from "@/lib/queries/pages";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { CertificationsStrip } from "@/components/about/certifications-strip";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const page = await getStaticPage({ key: "about", locale });
  if (!page) return {};
  return {
    ...buildPageMetadata({
      locale,
      tail: "/about",
      title: page.seoTitle ?? page.title,
      description: page.seoDescription ?? undefined,
    }),
    robots: { index: true, follow: true },
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const page = await getStaticPage({ key: "about", locale });
  if (!page) notFound();

  const tLegal = await getTranslations("legal");

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
        <span className="text-ink">{page.title}</span>
      </nav>

      {/* ── eyebrow + title ────────────────────────────────────── */}
      <header className="mt-10">
        <div className="eyebrow">About</div>
        <h1 className="mt-3 font-display text-display-lg leading-tight text-ink">
          {page.title}
        </h1>
      </header>

      <div className="rule my-10" />

      {/* Locale fallback notice — keeps us honest about translation gaps. */}
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

      {/* ── certifications ─────────────────────────────────────── */}
      <CertificationsStrip className="mt-16" />
    </article>
  );
}
