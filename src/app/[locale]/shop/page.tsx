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
  getShopCategories,
  getShopFilters,
  type ShopSort,
} from "@/lib/queries/products";
import { CategoryFilter } from "@/components/shop/category-filter";
import { LineTabs } from "@/components/shop/line-tabs";
import { SortSelect } from "@/components/shop/sort-select";
import { ShopFiltersShell } from "@/components/shop/shop-filters-shell";
import { ShopInfiniteGrid } from "@/components/shop/shop-infinite-grid";
import { buildPageMetadata } from "@/lib/seo/metadata";

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
  const brandSlugs = parseMulti(sp.brand);
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
  const [{ items, total }, categories, filters] = await Promise.all([
    getShopProducts({
      locale,
      sort,
      take: PAGE_SIZE,
      ...filterArgs,
    }),
    // Categories are now line-aware: when the user picks a line, the
    // strip below collapses to only the categories Sofia has stocked
    // for that line. Without a line filter we still show every shelf.
    getShopCategories(locale, { lineSlugs }),
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

      {/* ── line tabs (Yu.R · Yu.R Pro · Yu.R Me) ──────────────── */}
      {/* Top-row primary navigation. Lives in its own band — separated
          from the category strip below by generous whitespace so the
          two read as different layers of refinement. */}
      <div className="mt-16 border-t border-ink/10 pt-8">
        <LineTabs
          lines={filters.lines}
          activeSlug={lineSlugs?.[0]}
          preservedParams={(() => {
            // Build an URLSearchParams of every refinement we want to
            // preserve when the user toggles a line tab. Drop `line`
            // itself — the LineTabs component decides what to set.
            const sp = new URLSearchParams();
            if (sort && sort !== "newest") sp.set("sort", sort);
            if (skinTypeSlugs?.length) sp.set("skinType", skinTypeSlugs.join(","));
            if (concernSlugs?.length) sp.set("concern", concernSlugs.join(","));
            if (brandSlugs?.length) sp.set("brand", brandSlugs.join(","));
            if (ingredientSlugs?.length) sp.set("ingredient", ingredientSlugs.join(","));
            if (minPriceEur !== undefined) sp.set("minPrice", String(minPriceEur));
            if (maxPriceEur !== undefined) sp.set("maxPrice", String(maxPriceEur));
            return sp;
          })()}
        />
      </div>

      {/* ── category pills + sort ──────────────────────────────── */}
      <div className="mt-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <CategoryFilter
          categories={categories}
          activeSlug={categorySlug}
          sort={sort}
        />
        <SortSelect current={sort} />
      </div>

      {/* ── body: sidebar + grid ──────────────────────────────── */}
      {/*
       * ShopFiltersShell is rendered ONCE inside the sidebar column.
       * · Desktop: column is a 16rem inline sidebar next to the grid.
       * · Mobile:  grid collapses → the shell stacks above the grid, and
       *   the "Filters" trigger button inside it opens a slide-out drawer
       *   (the ShopFilters component handles both layouts internally).
       */}
      <div className="mt-10 grid grid-cols-1 gap-12 md:grid-cols-[16rem_1fr] md:gap-16">
        <ShopFiltersShell filters={filters} />

        <div>
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
      </div>
    </section>
  );
}
