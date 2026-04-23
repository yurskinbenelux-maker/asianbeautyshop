// ─────────────────────────────────────────────────────────────────────────
// /[locale]/shipping — public shipping information.
//
// Pulls body copy from the `Page` DB table (key = "shipping"), same
// admin-editable pipeline as /about and /faq. Belgian Code of Economic
// Law Art. VI.45 requires pre-contractual disclosure of delivery cost
// and time, so this page is a launch requirement, not optional.
//
// Sofia can refine wording any time via /admin/pages. Rates themselves
// still live in /admin/settings/shipping — this is narrative copy that
// explains them.
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
  const page = await getStaticPage({ key: "shipping", locale });
  if (!page) return {};
  return {
    ...buildPageMetadata({
      locale,
      tail: "/shipping",
      title: page.seoTitle ?? page.title,
      description: page.seoDescription ?? undefined,
    }),
    robots: { index: true, follow: true },
  };
}

export default async function ShippingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const page = await getStaticPage({ key: "shipping", locale });
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
        <div className="eyebrow">Shipping</div>
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
