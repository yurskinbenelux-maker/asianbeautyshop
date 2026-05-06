// ─────────────────────────────────────────────────────────────────────────
// /[locale]/new — placeholder until Phase 4 wires the real listing.
//
// Phase 4 adds Product.isNew toggle in admin + filters this page to
// products with isNew=true. For now this is a graceful placeholder.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "New arrivals — YU.R Skin Solution",
    description: "The newest YU.R products to land on yurskinsolution.eu.",
    alternates: {
      canonical: `/${locale}/new`,
    },
  };
}

export default async function NewArrivalsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  return (
    <section className="container py-24">
      <div className="mx-auto max-w-2xl text-center">
        <div className="text-[11px] uppercase tracking-label text-vermilion">
          {t("new_products")}
        </div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          New arrivals coming soon.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-ink-mid">
          Sofia&rsquo;s about to flag the first batch of new launches.
          For now, see what&rsquo;s already in the catalogue.
        </p>
        <div className="mt-8">
          <Link
            href={`/${locale}/shop`}
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-3 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
          >
            Browse the shop
          </Link>
        </div>
      </div>
    </section>
  );
}
