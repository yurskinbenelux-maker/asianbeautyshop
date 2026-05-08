// ─────────────────────────────────────────────────────────────────────────
// /[locale]/brands/[slug]/about — dedicated editorial page for one brand.
//
// Distinct from /shop/brand/[slug] which is the FILTERED PRODUCT LISTING
// for that brand (with sidebar filters + grid). This page is purely
// editorial: cover photo (or typographic fallback), display-type heading,
// tagline eyebrow, prose story, and a CTA back to the listing.
//
// aboutFromBrandId resolution happens in the query layer
// (getBrandAboutBySlug) so when a sub-brand inherits content from a
// canonical parent, this page just renders whatever the query returns —
// no logic here needs to know about the inheritance.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getBrandAboutBySlug } from "@/lib/queries/products";
import { buildPageMetadata } from "@/lib/seo/metadata";

// ISR — 5 minutes matches /shop and category landings. About content
// changes rarely; admin edits propagate within 5 minutes.
export const revalidate = 300;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const brand = await getBrandAboutBySlug(locale, slug);
  if (!brand) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  // Description prefers the brand's tagline (short, marketing-ready) and
  // falls back to a stripped-HTML preview of the story. Either way the
  // brand name leads.
  const description =
    brand.tagline ?? stripHtml(brand.story) ?? undefined;

  return buildPageMetadata({
    locale,
    tail: `/brands/${brand.slug}/about`,
    title: `About ${brand.name}`,
    description,
    ogImage: brand.coverImageUrl ?? undefined,
  });
}

export default async function BrandAboutPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const brand = await getBrandAboutBySlug(locale, slug);
  if (!brand) notFound();

  const tBrand = await getTranslations("brand");

  return (
    <article className="pb-20">
      {/* ── Hero ──────────────────────────────────────────────────────
          Full-bleed cover photo when uploaded; falls back to a typographic
          hero on cream so brands without a cover still feel intentional. */}
      {brand.coverImageUrl ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-rice-dim/40 md:aspect-[21/9]">
          <Image
            src={brand.coverImageUrl}
            alt={`${brand.name} cover`}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      ) : (
        <div className="container py-20 md:py-28">
          <div className="text-[11px] uppercase tracking-label text-vermilion">
            {tBrand("about_eyebrow")}
          </div>
        </div>
      )}

      {/* ── Editorial body ──────────────────────────────────────── */}
      <div className="container max-w-3xl">
        <header
          className={
            brand.coverImageUrl ? "mt-12 md:mt-16" : "-mt-10"
          }
        >
          {brand.coverImageUrl && (
            <div className="text-[11px] uppercase tracking-label text-vermilion">
              {tBrand("about_eyebrow")}
            </div>
          )}
          <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
            {brand.name}
          </h1>
          {brand.tagline && (
            <p className="mt-4 text-[17px] leading-relaxed text-ink">
              {brand.tagline}
            </p>
          )}
          {/* When the content is inherited (Yu.R Pro showing Yu.R's
              story), make that visible in small type so editors can
              spot it on review. Customers see it but it's deliberately
              quiet. */}
          {brand.inheritedFromName && (
            <p className="mt-3 text-[11px] uppercase tracking-label text-ink-mid">
              {tBrand("about_inherited_from", {
                parent: brand.inheritedFromName,
              })}
            </p>
          )}
        </header>

        {brand.story ? (
          <div
            className="prose prose-ink mt-10 max-w-none text-[16px] leading-relaxed text-ink-mid"
            dangerouslySetInnerHTML={{ __html: brand.story }}
          />
        ) : (
          <p className="mt-10 text-[14px] leading-relaxed text-ink-mid">
            {tBrand("about_empty")}
          </p>
        )}

        <div className="mt-16 border-t border-ink/10 pt-10">
          <Link
            href={`/shop/brand/${brand.slug}`}
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-3 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-ink/90"
          >
            {tBrand("about_browse_cta", { name: brand.name })}
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Strip HTML tags + clip to ~160 chars for meta descriptions. Same util
 *  as the brand landing page — kept inline rather than shared because
 *  the use site is one line and shared SEO utilities live elsewhere. */
function stripHtml(html: string | null): string | undefined {
  if (!html) return undefined;
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return undefined;
  return plain.length > 160 ? `${plain.slice(0, 157).trimEnd()}…` : plain;
}
