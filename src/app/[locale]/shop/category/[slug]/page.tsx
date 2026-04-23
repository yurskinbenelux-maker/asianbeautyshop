// ─────────────────────────────────────────────────────────────────────────
// /shop/category/[slug] — category landing page.
//
// Standalone page per category (essences, cleansers, serums, …) so that
// each category ranks on its own in search and Sofia has a place to
// merchandise it with a real editorial hero instead of just a filter pill.
//
// The hero (headline, intro paragraph, optional icon) is pulled from the
// CategoryTranslation row Sofia already edits on /admin/categories — no
// new table, no new form surface. If a translation doesn't have copy,
// we fall back to EN; if EN is empty too we just skip the intro block.
//
// The product grid itself reuses the same infrastructure as /shop (same
// filter sidebar, same infinite scroll, same query), always pre-scoped
// to this category. Extra facet filters remain URL-driven so a URL like
// /shop/category/serums?concern=dark-spots&sort=price_asc still works.
// ─────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import { maybeRedirect } from "@/lib/redirects/maybe-redirect";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import {
  getShopCategoryBySlug,
  getShopProducts,
  getShopFilters,
  type ShopSort,
} from "@/lib/queries/products";
import { SortSelect } from "@/components/shop/sort-select";
import { ShopFiltersShell } from "@/components/shop/shop-filters-shell";
import { ShopInfiniteGrid } from "@/components/shop/shop-infinite-grid";
import { buildPageMetadata } from "@/lib/seo/metadata";

// Mirror /shop so the two surfaces load comparably fast.
const PAGE_SIZE = 24;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{
    sort?: string;
    skinType?: string;
    concern?: string;
    brand?: string;
    ingredient?: string;
    minPrice?: string;
    maxPrice?: string;
  }>;
};

// Parsers duplicate the logic from /shop/page.tsx on purpose — these two
// pages share a contract about URL shape, not about code. Keeping the
// parsers inline means the types stay local and the file reads top-down.
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
  const category = await getShopCategoryBySlug(locale, slug);

  // If the slug doesn't resolve, fall back to a generic title rather than
  // crashing the metadata build. The page itself will 404 — this just
  // keeps the HEAD clean if a crawler is pre-fetching.
  if (!category) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  return buildPageMetadata({
    locale,
    tail: `/shop/category/${category.slug}`,
    title: category.seoTitle || category.name,
    description: category.seoDescription || stripHtml(category.description),
  });
}

export default async function CategoryLandingPage({
  params,
  searchParams,
}: Props) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  // 404 before doing any further work if the slug isn't a live category.
  const category = await getShopCategoryBySlug(locale, slug);
  if (!category) {
    await maybeRedirect(locale, `/shop/category/${slug}`);
    notFound();
  }

  const sort = parseSort(sp.sort);
  const skinTypeSlugs = parseMulti(sp.skinType);
  const concernSlugs = parseMulti(sp.concern);
  const brandSlugs = parseMulti(sp.brand);
  const ingredientSlugs = parseMulti(sp.ingredient);
  const minPriceEur = parsePrice(sp.minPrice);
  const maxPriceEur = parsePrice(sp.maxPrice);

  const t = await getTranslations("shop");

  // Always scope to this category — the URL segment is the source of
  // truth; we intentionally ignore any ?category= querystring collision
  // (would be user error anyway).
  const filterArgs = {
    categorySlug: category.slug,
    skinTypeSlugs,
    concernSlugs,
    brandSlugs,
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

  // Remount the infinite grid when filters/sort change — identical
  // pattern to /shop so the scroll-preservation contract holds.
  const resetKey = JSON.stringify({ sort, ...filterArgs });

  return (
    <section className="container py-20 md:py-28">
      {/* ── editorial hero ─────────────────────────────────────────── */}
      <div className="max-w-2xl">
        <div className="eyebrow">{t("eyebrow")}</div>
        <h1 className="mt-3 text-display-lg">{category.name}</h1>

        {/*
          description is rich HTML the admin enters in Tiptap — render it
          directly. It's owner-authored so we trust the markup; the admin
          editor sanitises before persisting.
        */}
        {category.description && (
          <div
            className="prose prose-ink mt-6 max-w-none text-[15px] leading-relaxed text-ink-mid"
            dangerouslySetInnerHTML={{ __html: category.description }}
          />
        )}
      </div>

      {/* ── sort row (no category pills — we're already inside a category) ── */}
      <div className="mt-16 flex flex-col gap-6 border-t border-ink/10 pt-8 md:flex-row md:items-center md:justify-end">
        <SortSelect current={sort} />
      </div>

      {/* ── body: sidebar + grid ──────────────────────────────────── */}
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

/**
 * Strip HTML tags for use in meta descriptions — we don't need a full
 * sanitiser here because SEO descriptions display as plain text anyway.
 * Truncates to 160 characters (Google's soft cap for description snippets).
 */
function stripHtml(html: string | null): string | undefined {
  if (!html) return undefined;
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return undefined;
  return plain.length > 160 ? `${plain.slice(0, 157).trimEnd()}…` : plain;
}
