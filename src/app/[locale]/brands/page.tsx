// ─────────────────────────────────────────────────────────────────────────
// /[locale]/brands — index of every active brand. Phase 1 ships a
// minimal version: a card grid of brand names with product counts,
// linking to the existing /shop/brand/[slug] filtered listing.
//
// Phase 2 enriches this with Brand.imageUrl uploaded via the admin
// /admin/brands page (each card gets a real image). For now the cards
// render the brand name in display type against a soft cream surface
// — clean and brand-faithful even without imagery.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getShopMegaMenuData } from "@/lib/queries/products";
import { Locale } from "@prisma/client";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Brands — YU.R Skin Solution",
    description: "Every brand carried by YU.R Skin Solution.",
    alternates: {
      canonical: `/${locale}/brands`,
      languages: {
        en: "/en/brands",
        nl: "/nl/brands",
        fr: "/fr/brands",
        ru: "/ru/brands",
      },
    },
  };
}

export default async function BrandsIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  // Reuse the same query the nav uses — single source of truth for
  // "which brands are live and what's their product count".
  const { brands } = await getShopMegaMenuData(locale as Locale);

  return (
    <section className="container py-16 md:py-24">
      <header className="mb-12 max-w-2xl">
        <div className="text-[11px] uppercase tracking-label text-vermilion">
          {t("brands")}
        </div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          Every YU.R line, in one place.
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-mid">
          Tap a brand to browse only its products. Phase 2 of this page
          will add a hero image to each card.
        </p>
      </header>

      {brands.length === 0 ? (
        <p className="text-[14px] text-ink-mid">No brands yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <Link
              key={b.slug}
              href={`/shop/brand/${b.slug}`}
              className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 border border-ink/10 bg-rice px-6 py-8 text-center transition-colors hover:border-ink/30 hover:bg-white"
            >
              <span className="font-display text-[40px] leading-[1.05] text-vermilion transition-colors group-hover:text-ink">
                {b.name}
              </span>
              <span className="text-[11px] uppercase tracking-label text-ink-mid">
                {b.count} {b.count === 1 ? "product" : "products"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
