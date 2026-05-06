// ─────────────────────────────────────────────────────────────────────────
// /[locale]/sale — placeholder until Phase 4 wires the real listing.
//
// Once Product.isOnSale + salePercent ship in Phase 3 and the dedicated
// listing in Phase 4, this page will render the shop grid pre-filtered
// to on-sale products, with a custom hero ("Up to X% off — limited
// stock"). For now it's a "coming soon" placeholder so the nav link
// doesn't 404.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Sale — YU.R Skin Solution",
    description: "Discover YU.R products on sale.",
    alternates: {
      canonical: `/${locale}/sale`,
    },
  };
}

export default async function SalePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  return (
    <section className="container py-24">
      <div className="mx-auto max-w-2xl text-center">
        <div className="text-[11px] uppercase tracking-label text-vermilion">
          {t("sale")}
        </div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          Sale arriving soon.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-ink-mid">
          We&rsquo;re finalising our first markdown edit. In the
          meantime, browse the full catalogue or take the skin quiz for
          a personalised 15% off your first routine.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/${locale}/shop`}
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-3 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
          >
            Browse the shop
          </Link>
          <Link
            href={`/${locale}/quiz`}
            className="inline-flex items-center gap-2 border border-ink/15 bg-white/60 px-6 py-3 text-[12px] uppercase tracking-label text-ink hover:border-ink"
          >
            Take the skin quiz
          </Link>
        </div>
      </div>
    </section>
  );
}
