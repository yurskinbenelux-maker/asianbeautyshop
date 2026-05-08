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
    title: "Brands — Asian Beauty Shop",
    description: "Every brand carried by Asian Beauty Shop.",
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
  // Two namespaces — "nav" for the existing brands header eyebrow, "brand"
  // for the new About-link strings on each tile. Loaded in parallel since
  // they hit the same dictionary file.
  const [t, tBrand] = await Promise.all([
    getTranslations("nav"),
    getTranslations("brand"),
  ]);

  const brands = await getBrandsForIndexPage(locale);

  return (
    <section className="container py-16 md:py-24">
      <header className="mb-12 max-w-2xl">
        <div className="text-[11px] uppercase tracking-label text-vermilion">
          {t("brands")}
        </div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          Every Asian Beauty Shop line, in one place.
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-mid">
          Tap a brand to browse only its products. an admin uploads each
          brand&rsquo;s logo and tagline from the admin panel.
        </p>
      </header>

      {brands.length === 0 ? (
        <p className="text-[14px] text-ink-mid">No brands yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            // Each tile is now a relative container — the logo+name area
            // is one Link (browse products), and the About link sits as
            // a separate sibling Link. Two clickable targets means we
            // can't nest <Link> inside <Link>; instead we use absolute
            // positioning + z-index so the About tab visually overlaps
            // the bottom-right corner of the tile without breaking the
            // outer click area.
            <div
              key={b.slug}
              className="group relative flex aspect-[4/3] flex-col overflow-hidden border border-ink/10 bg-rice transition-colors hover:border-ink/30"
            >
              {/* Main click target — covers the whole tile and sends
                  the visitor to the brand's filtered shop listing.
                  The About link below uses a higher z-index so its
                  click doesn't bubble through to this one. */}
              <Link
                href={`/shop/brand/${b.slug}`}
                className="absolute inset-0 z-0"
                aria-label={tBrand("browse_brand", { name: b.name })}
              />

              {/* ── Logo region ────────────────────────────────────
                  Top 60% of the card. When a logoUrl is set we render
                  it object-contain on a soft cream surface so the
                  artwork breathes; without one we fall back to a
                  large typographic treatment. */}
              <div className="pointer-events-none relative flex flex-1 items-center justify-center bg-rice-dim/40 px-6 py-6 transition-colors group-hover:bg-white">
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
                  Two-cell layout now: brand metadata on the left,
                  optional "About →" link on the right (separate click
                  target, hoverable with its own underline). The strip
                  itself remains pointer-events-none so the outer Link
                  catches clicks — the About anchor opts back in via
                  pointer-events-auto. */}
              <div className="pointer-events-none relative z-10 flex items-end justify-between gap-3 border-t border-ink/10 bg-rice px-5 py-4">
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
                {b.hasAbout && (
                  <Link
                    href={`/brands/${b.slug}/about`}
                    className="pointer-events-auto shrink-0 text-[11px] uppercase tracking-label text-ink-mid underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
                  >
                    {tBrand("about_cta")}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
