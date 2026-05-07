// ─────────────────────────────────────────────────────────────────────────
// /shop — full product listing with faceted filtering + sort.
//
// Server component. Everything filter/sort-related lives in the URL so
// the page is shareable and the back button works correctly.
//
//   /shop                                      → all products, newest first
//   /shop?category=essences                    → only essences
//   /shop?skinType=dry,sensitive&concern=acne  → multi-facet refinement
//   /shop?minPrice=20&maxPrice=80              → price range
//   /shop?sort=price_asc                       → cheapest first
//
// Multi-value params are comma-separated in the URL for readability.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import {
  getShopProducts,
  getShopCategoryTree,
  getShopFilters,
  type ShopSort,
} from "@/lib/queries/products";
import { CategoryStrip } from "@/components/shop/category-strip";
import { BrandTabs } from "@/components/shop/brand-tabs";
import { SortSelect } from "@/components/shop/sort-select";
import { ShopFiltersShell } from "@/components/shop/shop-filters-shell";
import { ShopInfiniteGrid } from "@/components/shop/shop-infinite-grid";
import { RecentlyViewedRail } from "@/components/shop/recently-viewed-rail";
import { buildPageMetadata } from "@/lib/seo/metadata";

// ISR caching — Next.js re-renders this page at most every 5 minutes.
// Visitors arriving within that window get the cached HTML. Admin
// edits (publishing a product, changing a category) become visible
// within at most 5 minutes without a manual cache bust. Bumped from
// 60s to 300s for performance — server does 5× less SSR work, scroll
// lag on Hostinger Business disappears. PDP uses the same TTL so the
// listing → detail click feels instant on the second-visit cache hit.
export const revalidate = 300;

// Page size for both the server-rendered first page and every subsequent
// fetch. 24 fills the 3-column grid 8 rows deep — tall enough to feel
// like a collection, short enough to LCP fast.
const PAGE_SIZE = 24;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    category?: string;
    sort?: string;
    skinType?: string;
    concern?: string;
    brand?: string;
    /** Multi-select product line slug list — `yur,yur-pro,yur-me`. */
    line?: string;
    ingredient?: string;
    minPrice?: string;
    maxPrice?: string;
  }>;
};

// Coerce the raw ?sort= param into our union type; fall back to newest.
function parseSort(raw?: string): ShopSort {
  if (raw === "price_asc" || raw === "price_desc" || raw === "newest") {
    return raw;
  }
  return "newest";
}

// Multi-value params are comma-separated ("dry,sensitive"). Empty tokens
// (from stray commas) are stripped so we don't pass empties to Prisma.
function parseMulti(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

// Price params are numeric; anything non-numeric is ignored rather than
// crashing the page.
function parsePrice(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  // Prefer the purpose-built SEO copy (optimised lengths + keywords)
  // but fall back to the shop header copy if SEO strings aren't there.
  const tSeo = await getTranslations({ locale, namespace: "seo" });
  const tShop = await getTranslations({ locale, namespace: "shop" });
  return buildPageMetadata({
    locale,
    tail: "/shop",
    title: tSeo("shop.title") || tShop("title"),
    description: tSeo("shop.description") || tShop("lede"),
  });
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const categorySlug = sp.category;
  const sort = parseSort(sp.sort);
  const skinTypeSlugs = parseMulti(sp.skinType);
  const concernSlugs = parseMulti(sp.concern);
  // Brand is the canonical strip param going forward. Legacy ?line=
  // bookmarks still resolve because the slugs match (yur, yur-pro,
  // yur-me are both Brand slugs and PRODUCT_LINES slugs). When both
  // are present, ?brand= wins.
  const brandSlugs = parseMulti(sp.brand) ?? parseMulti(sp.line);
  // We also keep lineSlugs separately so any legacy callers still
  // see something. New code shouldn't touch this — use brandSlugs.
  const lineSlugs = parseMulti(sp.line);
  const ingredientSlugs = parseMulti(sp.ingredient);
  const minPriceEur = parsePrice(sp.minPrice);
  const maxPriceEur = parsePrice(sp.maxPrice);

  const t = await getTranslations("shop");

  // Collect every filter arg in one object — shared by the server-side
  // listing query AND by the infinite-scroll client (which forwards it
  // to the server action on each load-more).
  const filterArgs = {
    categorySlug,
    skinTypeSlugs,
    concernSlugs,
    brandSlugs,
    lineSlugs,
    ingredientSlugs,
    minPriceEur,
    maxPriceEur,
  };

  // All three data calls are independent — run in parallel so the whole
  // page renders in one round-trip.
  const [{ items, total }, categoryTree, filters] = await Promise.all([
    getShopProducts({
      locale,
      sort,
      take: PAGE_SIZE,
      ...filterArgs,
    }),
    // Category tree (parents + non-empty children) with counts scoped
    // to the active brand so picking YU•R Pro narrows the strip
    // correctly. Empty subs and parents with no products are filtered
    // out by the query.
    getShopCategoryTree(locale, { brandSlugs }),
    getShopFilters(locale),
  ]);

  const resultsLabel = total === 1 ? t("results_one") : t("results_other");

  // Changing any filter or sort invalidates the loaded-items list — we
  // remount ShopInfiniteGrid by threading a resetKey that captures
  // everything that affects the query. JSON stringify is cheap here
  // (tiny object) and idempotent.
  const resetKey = JSON.stringify({ sort, ...filterArgs });

  return (
    <section className="container py-20 md:py-28">
      {/* ── header ────────────────────────────────────────────── */}
      <div className="max-w-xl">
        <div className="eyebrow">{t("eyebrow")}</div>
        <h1 className="mt-3 text-display-lg">{t("title")}</h1>
        <p className="mt-6 text-[15px] leading-relaxed text-ink-mid">
          {t("lede")}
        </p>
      </div>

      {/* Build the URL params we preserve when one of the strip
          components changes its own slug. Each component then strips
          its own param from this set before adding the new one.
          Computed once and reused below. */}
      {(() => null)()}

      {/* ── Row 1: brand tabs ─────────────────────────────────────── */}
      <div className="mt-16 border-t border-ink/10 pt-8">
        <BrandTabs
          brands={filters.brands}
          activeSlug={brandSlugs?.[0]}
          preservedParams={(() => {
            const sp = new URLSearchParams();
            if (sort && sort !== "newest") sp.set("sort", sort);
            if (categorySlug) sp.set("category", categorySlug);
            if (skinTypeSlugs?.length) sp.set("skinType", skinTypeSlugs.join(","));
            if (concernSlugs?.length) sp.set("concern", concernSlugs.join(","));
            if (ingredientSlugs?.length) sp.set("ingredient", ingredientSlugs.join(","));
            if (minPriceEur !== undefined) sp.set("minPrice", String(minPriceEur));
            if (maxPriceEur !== undefined) sp.set("maxPrice", String(maxPriceEur));
            return sp;
          })()}
        />
      </div>

      {/* ── Rows 2 + 3: category strip (parent row + sub row) ─────── */}
      <div className="mt-8">
        <CategoryStrip
          tree={categoryTree}
          activeSlug={categorySlug}
          preservedParams={(() => {
            const sp = new URLSearchParams();
            if (sort && sort !== "newest") sp.set("sort", sort);
            if (brandSlugs?.length) sp.set("brand", brandSlugs.join(","));
            if (skinTypeSlugs?.length) sp.set("skinType", skinTypeSlugs.join(","));
            if (concernSlugs?.length) sp.set("concern", concernSlugs.join(","));
            if (ingredientSlugs?.length) sp.set("ingredient", ingredientSlugs.join(","));
            if (minPriceEur !== undefined) sp.set("minPrice", String(minPriceEur));
            if (maxPriceEur !== undefined) sp.set("maxPrice", String(maxPriceEur));
            return sp;
          })()}
        />
      </div>

      {/* ── Toolbar: filters trigger + sort ───────────────────────── */}
      <div className="mt-10 flex items-center justify-between gap-4 border-t border-ink/10 pt-6">
        <ShopFiltersShell filters={filters} />
        <SortSelect current={sort} />
      </div>

      {/* ── Grid (full-width — sidebar retired) ───────────────────── */}
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

      {/* ── recently viewed (client-only; hidden when empty) ───── */}
      <RecentlyViewedRail />
    </section>
  );
}
