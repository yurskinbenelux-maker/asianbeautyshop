// ─────────────────────────────────────────────────────────────────────────
// /shop/[slug] — product detail page.
//
// The slug is locale-specific (rice-water-cleanser / rijstwater-reiniger /
// nettoyant-eau-de-riz / ochishchayushchij-risovyj-gel). getProductBySlug
// does the (locale, slug) lookup; everything else is layout.
//
// Sections, top-to-bottom:
//   1. Breadcrumb
//   2. Hero — gallery + info (brand, title, tagline, tag rail, price,
//              variant selector, add-to-ritual, description)
//   3. Ingredient breakdown (key assets + full INCI collapsible)
//   4. Ritual steps (01/02/03)
//   5. Reviews summary + list
//   6. Complete-your-ritual bundle (curated via ProductRelated)
//   7. Related products (loose "wear with" grid)
//   8. Back-to-shop link
//
// Every section self-hides when it has no content so a product with
// minimal data still looks intentional instead of gappy.
// ─────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import { maybeRedirect } from "@/lib/redirects/maybe-redirect";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import NextLink from "next/link";
import {
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/queries/products";
import {
  getProductVariants,
  getProductIngredients,
  getProductBenefits,
  getProductSkinTypes,
  getProductConcerns,
  getProductRitualSteps,
  getProductReviewSummary,
  getProductReviews,
  getProductBundle,
} from "@/lib/queries/pdp";
import { priceLocale } from "@/lib/utils";
import { ProductGallery } from "@/components/shop/product-gallery";
import { RecentlyViewedRail } from "@/components/shop/recently-viewed-rail";
import { TrackRecentlyViewed } from "@/components/shop/track-recently-viewed";
import { ProductPurchase } from "@/components/shop/pdp/product-purchase";
import { PdpTagRail } from "@/components/shop/pdp/pdp-tag-rail";
import { IngredientSection } from "@/components/shop/pdp/ingredient-section";
import { RitualStepsSection } from "@/components/shop/pdp/ritual-steps-section";
import { ReviewsSection } from "@/components/shop/pdp/reviews-section";
import { RitualBundleSection } from "@/components/shop/pdp/ritual-bundle-section";
import { ProductDetailsPanel } from "@/components/shop/pdp/product-details-panel";
import { BestsellerCard } from "@/components/home/bestseller-card";
import { LocaleAlternatesProvider } from "@/components/layout/locale-alternates";
import { JsonLd } from "@/components/seo/json-ld";
import { productJsonLd, siteOrigin } from "@/lib/seo/json-ld";
import { buildPageMetadataPerLocale } from "@/lib/seo/metadata";
import { Locale as PrismaLocale } from "@prisma/client";
import { isAdminEmail, getCurrentUser } from "@/lib/auth";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const { preview } = await searchParams;
  // Admin preview pages must never be indexed — emit a cheap noindex
  // response before we even hit the DB. We don't bother verifying admin
  // identity here; a non-admin who reaches the URL will see `notFound()`
  // in the page anyway, and noindex on a 404 is harmless.
  if (preview === "1" || preview === "true") {
    return { robots: { index: false, follow: false } };
  }
  const p = await getProductBySlug({ locale, slug });
  if (!p) return {};

  // Build { en: "/shop/<en-slug>", nl: "/shop/<nl-slug>", … } so every
  // localised PDP correctly hreflangs to its translated sibling. Falls
  // back to the EN slug for any locale the product isn't translated into.
  const perLocaleTail: Partial<Record<"en" | "nl" | "fr" | "ru", string>> = {};
  const enSlug = p.slugByLocale[PrismaLocale.EN] ?? slug;
  for (const [loc, s] of Object.entries(p.slugByLocale)) {
    if (!s) continue;
    perLocaleTail[loc.toLowerCase() as keyof typeof perLocaleTail] = `/shop/${s}`;
  }
  // Ensure every locale has at least a fallback tail.
  for (const loc of ["en", "nl", "fr", "ru"] as const) {
    if (!perLocaleTail[loc]) perLocaleTail[loc] = `/shop/${enSlug}`;
  }

  return buildPageMetadataPerLocale({
    locale,
    perLocaleTail,
    title: p.name,
    description: p.tagline ?? undefined,
    ogImage: p.images[0]?.url ?? null,
    ogType: "product",
  });
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: Props) {
  const { locale, slug } = await params;
  const { preview } = await searchParams;
  setRequestLocale(locale);

  // Admin preview mode — gated server-side so nobody can peek at DRAFT
  // products by guessing the query param. We only unlock when both:
  //   (a) the URL requested ?preview=1, and
  //   (b) the viewer is signed-in with an admin-allowlisted email.
  const isPreviewRequest = preview === "1" || preview === "true";
  let previewMode = false;
  if (isPreviewRequest) {
    const user = await getCurrentUser();
    previewMode = isAdminEmail(user?.email);
  }

  const product = await getProductBySlug({
    locale,
    slug,
    allowUnpublished: previewMode,
  });
  if (!product) {
    // Renamed slugs land here — if the admin created a redirect row
    // (either manually or auto-inserted via updateTranslation), send
    // the visitor there with a 301 instead of a cold 404.
    await maybeRedirect(locale, `/shop/${slug}`);
    notFound();
  }

  // Fire every PDP-extras query in parallel. They're independent reads
  // keyed on productId, so one round-trip is plenty.
  const [
    t,
    variants,
    ingredients,
    benefits,
    skinTypes,
    concerns,
    ritualSteps,
    reviewSummary,
    reviews,
    bundle,
    related,
  ] = await Promise.all([
    getTranslations("product"),
    getProductVariants({
      productId: product.id,
      basePriceEur: product.priceEur,
      baseComparePriceEur: product.comparePriceEur,
    }),
    getProductIngredients({ productId: product.id, locale }),
    getProductBenefits({ productId: product.id, locale }),
    getProductSkinTypes({ productId: product.id, locale }),
    getProductConcerns({ productId: product.id, locale }),
    getProductRitualSteps({ productId: product.id, locale }),
    getProductReviewSummary({ productId: product.id }),
    getProductReviews({ productId: product.id, locale, limit: 8 }),
    getProductBundle({ productId: product.id, locale }),
    getRelatedProducts({
      locale,
      productId: product.id,
      categorySlug: product.primaryCategorySlug,
      limit: 3,
    }),
  ]);

  const currencyLocale = priceLocale(locale);

  // Build the map the LocaleSwitcher uses to jump to the right translated
  // URL. slugByLocale is keyed by Prisma's uppercase enum (EN/NL/FR/RU);
  // URL locales are lowercase, so we normalise here.
  const localeAlternates: Record<string, string> = {};
  for (const [loc, slugForLocale] of Object.entries(product.slugByLocale)) {
    if (slugForLocale) {
      localeAlternates[loc.toLowerCase()] = `/shop/${slugForLocale}`;
    }
  }

  // Build the Product JSON-LD payload. We mark it in-stock if any variant
  // has positive stock OR the product has no variants at all (single-SKU
  // products default to available). Reviews are only included when we
  // actually have some — Google rejects the block if reviewCount is 0.
  const anyStock = variants.length === 0
    ? true
    : variants.some((v) => v.stock > 0);
  const productLdPayload = productJsonLd({
    name: product.name,
    description: product.tagline,
    sku: product.sku,
    brandName: product.brand?.name ?? null,
    priceEur: product.priceEur,
    comparePriceEur: product.comparePriceEur,
    images: product.images,
    inStock: anyStock,
    canonicalUrl: `${siteOrigin()}/${locale}/shop/${product.slug}`,
    review: {
      ratingValue: reviewSummary.average,
      reviewCount: reviewSummary.count,
    },
  });

  return (
    <LocaleAlternatesProvider alternates={localeAlternates}>
      {/*
        JSON-LD is a search signal — we don't want Google indexing preview
        URLs, so we skip the LD payload entirely when in preview mode. The
        browser still renders the page normally.
      */}
      {!previewMode && <JsonLd data={productLdPayload} />}
      <article className="pb-24">
        {/* ── preview banner (admin only) ────────────────────────── */}
        {previewMode && (
          <div className="bg-ink text-white">
            <div className="container flex flex-wrap items-center justify-between gap-3 py-2 text-[11px] uppercase tracking-label">
              <span>
                Preview mode · unpublished products are only visible to admins
              </span>
              {/*
                NextLink (not the locale-aware one) because /admin is a
                non-localized route group — the i18n Link would prepend the
                locale and send Sofia to /en/admin/products (404).
              */}
              <NextLink
                href="/admin/products"
                className="underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
              >
                Back to admin
              </NextLink>
            </div>
          </div>
        )}

        {/* ── breadcrumb ─────────────────────────────────────────── */}
        <div className="container pt-10">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid"
          >
            <Link href="/shop" className="transition-colors hover:text-ink">
              {t("breadcrumb_shop")}
            </Link>
            {product.primaryCategoryName && (
              <>
                <span aria-hidden>·</span>
                <Link
                  href={`/shop/category/${product.primaryCategorySlug}`}
                  className="transition-colors hover:text-ink"
                >
                  {product.primaryCategoryName}
                </Link>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="text-ink">{product.name}</span>
          </nav>
        </div>

        {/* ── hero: gallery + info ──────────────────────────────── */}
        <section className="container mt-10 grid grid-cols-1 gap-12 md:mt-16 md:grid-cols-2 md:gap-16">
          <ProductGallery
            images={product.images}
            productName={product.name}
            isFeatured={product.isFeatured}
            viewTransitionSlug={product.slug}
          />
          {/* Track this PDP in localStorage so the rail at the bottom
              of the page can surface it on subsequent visits. Renders
              nothing — pure side-effect on mount. */}
          <TrackRecentlyViewed
            slug={product.slug}
            name={product.name}
            imageUrl={product.images[0]?.url ?? null}
            priceEur={product.priceEur}
            comparePriceEur={product.comparePriceEur}
          />

          {/* ── info column ────────────────────────────────────── */}
          <div className="md:pt-4">
            {product.brand && (
              // Eyebrow links to the brand landing page — K-beauty shoppers
              // often want to see everything by a brand once they've found
              // one product they like.
              <Link
                href={`/shop/brand/${product.brand.slug}`}
                className="eyebrow inline-block transition-colors hover:text-vermilion"
              >
                {product.brand.name}
              </Link>
            )}
            <h1 className="mt-3 font-display text-display-md leading-tight text-ink">
              {product.name}
            </h1>

            {product.tagline && (
              <p className="mt-4 text-[15px] leading-relaxed text-ink-mid">
                {product.tagline}
              </p>
            )}

            {/* tag rail: benefits / skin types / concerns */}
            <PdpTagRail
              benefits={benefits}
              skinTypes={skinTypes}
              concerns={concerns}
              labels={{
                benefits: t("benefits_label"),
                goodFor: t("good_for_label"),
                bestFor: t("best_for_label"),
              }}
            />

            <div className="rule my-8" />

            {/* price row + variant selector + add-to-ritual */}
            <ProductPurchase
              productId={product.id}
              sku={product.sku}
              basePriceEur={product.priceEur}
              baseComparePriceEur={product.comparePriceEur}
              volumeMl={product.volumeMl}
              currencyLocale={currencyLocale}
              variants={variants}
            />

            {/* description (on the info column, tighter layout) */}
            <div
              className="prose-editorial mt-10 text-[15px] leading-[1.7] text-ink-mid"
              dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
            />
          </div>
        </section>

        {/* ── ritual / how to use (inline HTML from admin) ──────── */}
        {product.howToUseHtml && (
          <section className="container mt-24 max-w-3xl">
            <div className="eyebrow">{t("how_to_use")}</div>
            <div
              className="prose-editorial mt-6 text-[16px] leading-[1.75] text-ink"
              dangerouslySetInnerHTML={{ __html: product.howToUseHtml }}
            />
          </section>
        )}

        {/* ── ritual steps (01/02/03 cards) ─────────────────────── */}
        <RitualStepsSection
          steps={ritualSteps}
          labels={{
            eyebrow: t("ritual_eyebrow"),
            morning: t("morning"),
            evening: t("evening"),
            anyTime: t("any_time"),
          }}
        />

        {/* ── ingredients ───────────────────────────────────────── */}
        {/* fullInciText comes from Product.inciList — the legally-correct
            full declaration from the supplier. When present, the section
            renders it as the source of truth in the "Show the list"
            accordion (otherwise it falls back to the pivot list). */}
        <IngredientSection
          ingredients={ingredients}
          fullInciText={product.inciList}
          labels={{
            eyebrow: t("key_ingredients_eyebrow"),
            keyTitle: t("key_ingredients_title"),
            fullTitle: t("full_ingredients_title"),
            show: t("full_ingredients_show"),
            hide: t("full_ingredients_hide"),
            allergenSuffix: t("allergen_suffix"),
          }}
        />

        {/* ── product details / specifications ─────────────────── */}
        {/* Origin country, shelf life, audience, product-line and the
            per-locale safety disclosure. All optional — the panel
            self-hides if the product has none of these set. */}
        <ProductDetailsPanel
          originCountry={product.originCountry}
          shelfLifeMonths={product.shelfLifeMonths}
          audienceCategory={product.audienceCategory}
          productLine={product.productLine}
          warnings={product.warningsText}
          locale={locale}
          labels={{
            eyebrow: t("details_eyebrow"),
            origin: t("details_origin"),
            shelfLife: t("details_shelf_life"),
            shelfLifeUnit: t("details_shelf_life_unit"),
            audience: t("details_audience"),
            productLine: t("details_product_line"),
            safety: t("details_safety"),
          }}
          audienceLabels={{
            UNISEX: t("audience_unisex"),
            WOMEN: t("audience_women"),
            MEN: t("audience_men"),
            KIDS: t("audience_kids"),
            BABIES: t("audience_babies"),
          }}
        />

        {/* ── reviews ───────────────────────────────────────────── */}
        <ReviewsSection
          summary={reviewSummary}
          reviews={reviews}
          dateLocale={currencyLocale}
          labels={{
            eyebrow: t("reviews_eyebrow"),
            averageTitle: t("reviews_average"),
            countOne: t("review_count_one"),
            countOther: t("review_count_other"),
            verified: t("verified"),
            noneTitle: t("reviews_none_title"),
            noneBody: t("reviews_none_body"),
            outOfFive: t("out_of_five"),
          }}
        />

        {/* ── complete your ritual (curated bundle) ─────────────── */}
        <RitualBundleSection
          items={bundle}
          currencyLocale={currencyLocale}
          labels={{
            eyebrow: t("bundle_eyebrow"),
            title: t("bundle_title"),
            add: t("bundle_add"),
          }}
        />

        {/* ── related products ──────────────────────────────────── */}
        {related.length > 0 && (
          <section className="container mt-24">
            <div className="eyebrow">{t("related")}</div>
            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
              {related.map((p, i) => (
                <BestsellerCard
                  key={p.id}
                  product={p}
                  index={i}
                  locale={locale}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── recently viewed (client-only; hidden when empty) ─── */}
        <RecentlyViewedRail excludeSlug={product.slug} />

        {/* ── back link (soft landing at the bottom) ────────────── */}
        <div className="container mt-24 flex justify-center">
          <Link
            href="/shop"
            className="text-[12px] uppercase tracking-label text-ink-mid underline decoration-vermilion underline-offset-8 transition-colors hover:text-ink"
          >
            ← {t("back_to_shop")}
          </Link>
        </div>
      </article>
    </LocaleAlternatesProvider>
  );
}
