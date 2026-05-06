// ─────────────────────────────────────────────────────────────────────────
// /[locale]/brands — index of every active brand. Each card renders the
// brand's logo (uploaded from /admin/categories/brands/[id]) when set,
// the brand name in display type, the localised tagline, and the
// product count. Click → /shop/brand/[slug] (the existing filtered
// listing).
//
// Cards without a logo fall back to a typographic-only treatment that
// still looks intentional — clean cream surface with the brand name in
// vermilion display type.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getBrandsForIndexPage } from "@/lib/queries/products";

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

  const brands = await getBrandsForIndexPage(locale);

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
          Tap a brand to browse only its products. Sofia uploads each
          brand&rsquo;s logo and tagline from the admin panel.
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
              className="group flex aspect-[4/3] flex-col overflow-hidden border border-ink/10 bg-rice transition-colors hover:border-ink/30"
            >
              {/* ── Logo region ────────────────────────────────────
                  Top 60% of the card. When a logoUrl is set we render
                  it object-contain on a soft cream surface so the
                  artwork breathes; without one we fall back to a
                  large typographic treatment. */}
              <div className="relative flex flex-1 items-center justify-center bg-rice-dim/40 px-6 py-6 transition-colors group-hover:bg-white">
                {b.logoUrl ? (
                  <Image
                    src={b.logoUrl}
                    alt={`${b.name} logo`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-contain p-8"
                  />
                ) : (
                  <span className="font-display text-[44px] leading-[1.05] text-vermilion transition-colors group-hover:text-ink">
                    {b.name}
                  </span>
                )}
              </div>

              {/* ── Caption strip ──────────────────────────────────
                  Brand name + tagline + product count. Anchored to
                  the bottom of the card so cards with logos still
                  surface the metadata cleanly. */}
              <div className="flex items-end justify-between gap-3 border-t border-ink/10 bg-rice px-5 py-4">
                <div className="min-w-0">
                  <div className="font-display text-[18px] leading-[1.1] text-ink">
                    {b.name}
                  </div>
                  {b.tagline && (
                    <div className="mt-0.5 truncate text-[12px] text-ink-mid">
                      {b.tagline}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-label text-ink-mid">
                  {b.productCount}{" "}
                  {b.productCount === 1 ? "product" : "products"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
