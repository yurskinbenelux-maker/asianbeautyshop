// ─────────────────────────────────────────────────────────────────────────
// /shop/brand/[slug] — brand landing page.
//
// K-beauty shoppers discover by brand first ("do you carry COSRX?",
// "anything from Beauty of Joseon?"). This page gives each brand a
// canonical URL, an editorial hero (tagline + story + logo), and its
// full product grid — essential for SEO and for the "brand page" link
// that the homepage bestseller carousel and the PDP sidebar link to.
//
// Mirrors the category landing page structure — same filter sidebar,
// same infinite scroll, same query infrastructure. Brand slug is the
// single source of truth (we ignore any ?brand= collision on the
// querystring).
// ─────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import { maybeRedirect } from "@/lib/redirects/maybe-redirect";
import Image from "next/image";

// Brand pages cache for 5 minutes — same shape as category landings.
// Bumped from 60s to 300s to cut SSR work 5× on Hostinger Business.
export const revalidate = 300;

import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import {
  getShopBrandBySlug,
  getShopProducts,
  getShopFilters,
  type ShopSort,
} from "@/lib/queries/products";
import { SortSelect } from "@/components/shop/sort-select";
import { ShopFiltersShell } from "@/components/shop/shop-filters-shell";
import { ShopInfiniteGrid } from "@/components/shop/shop-infinite-grid";
import { buildPageMetadata } from "@/lib/seo/metadata";

const PAGE_SIZE = 24;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{
    sort?: string;
    category?: string;
    skinType?: string;
    concern?: string;
    ingredient?: string;
    minPrice?: string;
    maxPrice?: string;
  }>;
};

function parseSort(raw?: string): ShopSort {
  if (raw === "price_asc" || raw === "price_desc" || raw === "newest") {
    return raw;
  }
  return "newest";
}

function parseMulti(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parsePrice(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const { locale, slug } = await params;
  const brand = await getShopBrandBySlug(locale, slug);

  if (!brand) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  // Brand doesn't have dedicated SEO fields — synthesise from tagline
  // (plenty short for meta-description territory) falling back to a
  // trimmed story. Title is just the brand name — the base layout's
  // template adds the " · YU.R" suffix.
  const description =
    brand.tagline ?? stripHtml(brand.story) ?? undefined;

  return buildPageMetadata({
    locale,
    tail: `/shop/brand/${brand.slug}`,
    title: brand.name,
    description,
    ogImage: brand.logoUrl ?? undefined,
  });
}

export default async function BrandLandingPage({
  params,
  searchParams,
}: Props) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const brand = await getShopBrandBySlug(locale, slug);
  if (!brand) {
    await maybeRedirect(locale, `/shop/brand/${slug}`);
    notFound();
  }

  const sort = parseSort(sp.sort);
  const categorySlug = sp.category;
  const skinTypeSlugs = parseMulti(sp.skinType);
  const concernSlugs = parseMulti(sp.concern);
  const ingredientSlugs = parseMulti(sp.ingredient);
  const minPriceEur = parsePrice(sp.minPrice);
  const maxPriceEur = parsePrice(sp.maxPrice);

  const t = await getTranslations("shop");

  // Always scope to this single brand. Category + other facets remain
  // available as optional refinements via querystring (useful when a
  // single brand has dozens of SKUs across categories).
  const filterArgs = {
    categorySlug,
    brandSlugs: [brand.slug],
    skinTypeSlugs,
    concernSlugs,
    ingredientSlugs,
    minPriceEur,
    maxPriceEur,
  };

  const [{ items, total }, filters] = await Promise.all([
    getShopProducts({
      locale,
      sort,
      take: PAGE_SIZE,
      ...filterArgs,
    }),
    getShopFilters(locale),
  ]);

  const resultsLabel = total === 1 ? t("results_one") : t("results_other");

  const resetKey = JSON.stringify({ sort, ...filterArgs });

  return (
    <section className="container py-20 md:py-28">
      {/* ── editorial hero ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          {/*
            Hardcoded "Brand" eyebrow — we intentionally don't localise this
            one-word label (it reads the same in EN/NL/FR and as "Бренд" in
            RU). If we want full localisation later, add a `shop.brand_eyebrow`
            key to the dictionaries. For now, less translation surface = less
            drift risk before launch.
          */}
          <div className="eyebrow">Brand</div>
          <h1 className="mt-3 text-display-lg">{brand.name}</h1>
          {brand.tagline && (
            <p className="mt-4 text-[17px] leading-relaxed text-ink">
              {brand.tagline}
            </p>
          )}
          {brand.story && (
            <div
              className="prose prose-ink mt-6 max-w-none text-[15px] leading-relaxed text-ink-mid"
              dangerouslySetInnerHTML={{ __html: brand.story }}
            />
          )}
        </div>

        {/*
          Brand logo — decorative accent, not the primary identifier
          (the H1 already names the brand). Loaded with priority so it
          shows with the hero text, and sized generously on wide screens.
          aria-hidden because the name is already read to screen readers
          by the H1.
        */}
        {brand.logoUrl && (
          <div
            aria-hidden
            className="relative h-24 w-40 shrink-0 md:h-32 md:w-56"
          >
            <Image
              src={brand.logoUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 160px, 224px"
              className="object-contain"
              priority
            />
          </div>
        )}
      </div>

      {/* ── Toolbar: filters drawer trigger + sort ───────────────────
          Matches /shop and /shop/category. Drawer-style trigger frees
          the grid to run full-width (4-up on desktop) instead of the
          old left-sidebar split. */}
      <div className="mt-16 flex items-center justify-between gap-4 border-t border-ink/10 pt-8">
        <ShopFiltersShell filters={filters} />
        <SortSelect current={sort} />
      </div>

      {/* ── Grid (full-width, no sidebar) ─────────────────────────── */}
      <div className="mt-6">
        {items.length === 0 ? (
          <p className="mt-10 text-ink-mid">{t("empty")}</p>
        ) : (
          <>
            <p className="text-[12px] uppercase tracking-label text-ink-mid">
              {total} {resultsLabel}
            </p>
            <div className="mt-4">
              <ShopInfiniteGrid
                key={resetKey}
                initialItems={items}
                total={total}
                pageSize={PAGE_SIZE}
                locale={locale}
                sort={sort}
                filterArgs={filterArgs}
                labels={{ loadMore: t("load_more") }}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Strip HTML tags + clip to ~160 chars for meta descriptions. */
function stripHtml(html: string | null): string | undefined {
  if (!html) return undefined;
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return undefined;
  return plain.length > 160 ? `${plain.slice(0, 157).trimEnd()}…` : plain;
}
