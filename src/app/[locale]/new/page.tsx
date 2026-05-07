// ─────────────────────────────────────────────────────────────────────────
// /[locale]/new — products with isNew=true.
//
// Same architecture as /shop "all" page (BrandTabs + hierarchical
// CategoryStrip + filter drawer + 4-col grid + infinite scroll), with
// one locked filter: isNewOnly=true.
//
// IMPORTANT: this page is NOT createdAt-based. Sofia controls
// membership manually via the "New arrival" toggle on each product's
// admin Basics form. A product uploaded six months ago can be flagged
// New (e.g. it just got a glossy hero shoot); a product uploaded
// yesterday that she doesn't want featured stays out.
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

// 5-minute ISR — matches /shop and category landings. isNew flag edits
// land within 5 minutes; Hostinger SSR cost drops 5×.
export const revalidate = 300;
const PAGE_SIZE = 24;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    category?: string;
    sort?: string;
    skinType?: string;
    concern?: string;
    brand?: string;
    line?: string;
    ingredient?: string;
    minPrice?: string;
    maxPrice?: string;
  }>;
};

function parseSort(raw?: string): ShopSort {
  if (raw === "price_asc" || raw === "price_desc" || raw === "newest") return raw;
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
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "new_page" });
  return buildPageMetadata({
    locale,
    tail: "/new",
    title: t("seo_title"),
    description: t("seo_description"),
  });
}

export default async function NewArrivalsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const categorySlug = sp.category;
  const sort = parseSort(sp.sort);
  const skinTypeSlugs = parseMulti(sp.skinType);
  const concernSlugs = parseMulti(sp.concern);
  const brandSlugs = parseMulti(sp.brand) ?? parseMulti(sp.line);
  const lineSlugs = parseMulti(sp.line);
  const ingredientSlugs = parseMulti(sp.ingredient);
  const minPriceEur = parsePrice(sp.minPrice);
  const maxPriceEur = parsePrice(sp.maxPrice);

  const t = await getTranslations("new_page");
  const tShop = await getTranslations("shop");

  // Locked filter — only products with isNew=true.
  const filterArgs = {
    categorySlug,
    skinTypeSlugs,
    concernSlugs,
    brandSlugs,
    lineSlugs,
    ingredientSlugs,
    minPriceEur,
    maxPriceEur,
    isNewOnly: true,
  };

  const [{ items, total }, categoryTree, filters] = await Promise.all([
    getShopProducts({ locale, sort, take: PAGE_SIZE, ...filterArgs }),
    getShopCategoryTree(locale, { brandSlugs }),
    getShopFilters(locale),
  ]);

  const resultsLabel = total === 1 ? tShop("results_one") : tShop("results_other");
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

      {/* ── Row 1: brand tabs ─────────────────────────────────────── */}
      <div className="mt-16 border-t border-ink/10 pt-8">
        <BrandTabs
          brands={filters.brands}
          activeSlug={brandSlugs?.[0]}
          preservedParams={(() => {
            const p = new URLSearchParams();
            if (sort && sort !== "newest") p.set("sort", sort);
            if (categorySlug) p.set("category", categorySlug);
            if (skinTypeSlugs?.length) p.set("skinType", skinTypeSlugs.join(","));
            if (concernSlugs?.length) p.set("concern", concernSlugs.join(","));
            if (ingredientSlugs?.length) p.set("ingredient", ingredientSlugs.join(","));
            if (minPriceEur !== undefined) p.set("minPrice", String(minPriceEur));
            if (maxPriceEur !== undefined) p.set("maxPrice", String(maxPriceEur));
            return p;
          })()}
        />
      </div>

      {/* ── Rows 2 + 3: category strip ────────────────────────────── */}
      <div className="mt-8">
        <CategoryStrip
          tree={categoryTree}
          activeSlug={categorySlug}
          preservedParams={(() => {
            const p = new URLSearchParams();
            if (sort && sort !== "newest") p.set("sort", sort);
            if (brandSlugs?.length) p.set("brand", brandSlugs.join(","));
            if (skinTypeSlugs?.length) p.set("skinType", skinTypeSlugs.join(","));
            if (concernSlugs?.length) p.set("concern", concernSlugs.join(","));
            if (ingredientSlugs?.length) p.set("ingredient", ingredientSlugs.join(","));
            if (minPriceEur !== undefined) p.set("minPrice", String(minPriceEur));
            if (maxPriceEur !== undefined) p.set("maxPrice", String(maxPriceEur));
            return p;
          })()}
        />
      </div>

      {/* ── Toolbar: filters + sort ───────────────────────────────── */}
      <div className="mt-10 flex items-center justify-between gap-4 border-t border-ink/10 pt-6">
        <ShopFiltersShell filters={filters} />
        <SortSelect current={sort} />
      </div>

      {/* ── Grid ──────────────────────────────────────────────────── */}
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
                labels={{ loadMore: tShop("load_more") }}
              />
            </div>
          </>
        )}
      </div>

      <RecentlyViewedRail />
    </section>
  );
}
