// ─────────────────────────────────────────────────────────────────────────
// /[locale]/search — global product search results.
//
// ?q=<query>  — submits from the header search overlay. Empty queries
// render a gentle prompt rather than "no results" so the state reads as
// "we're waiting" instead of "we failed you".
//
// Faceted search (task #92):
//   A non-empty query now unlocks the full /shop filter sidebar + sort
//   dropdown. The query string keys are identical to /shop —
//   `category`, `skinType`, `concern`, `brand`, `ingredient`,
//   `minPrice`, `maxPrice`, `sort` — so the sidebar + sort select
//   components work here with zero adaptation. `q` is preserved by both
//   (neither touches it).
//
// Zero-result behaviour:
//   · Query set, no facet filters, no matches → editorial strips
//     (skincare routine steps + brand suggestions). This is the recovery state
//     for ambiguous or typo'd queries.
//   · Query set, facet filters active, no matches → terse "relax a
//     filter" message with the sidebar still visible so they can.
//   · Query set, matches → grid + "refine" sidebar + count.
//
// The page itself stays noindexed so query URLs don't balloon the index.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import {
  searchProducts,
  getTopBrandSuggestions,
  getShopFilters,
  type ShopSort,
} from "@/lib/queries/products";
import { BestsellerCard } from "@/components/home/bestseller-card";
import { SortSelect } from "@/components/shop/sort-select";
import { ShopFiltersShell } from "@/components/shop/shop-filters-shell";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { getSiteCopy, siteCopyOr } from "@/lib/queries/site-copy";

// Cap the number of hits the /search page renders. The catalog is small
// enough that 36 is effectively "all of them" for any realistic query;
// anything past this point should arrive via the /shop grid's infinite
// scroll, not search. If `total` exceeds this cap we surface a hint
// prompting the user to narrow with filters.
const PAGE_SIZE = 36;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    sort?: string;
    category?: string;
    skinType?: string;
    concern?: string;
    brand?: string;
    ingredient?: string;
    minPrice?: string;
    maxPrice?: string;
  }>;
};

// ── URL param parsers (duplicated from /shop/page.tsx on purpose — these
//    are defensive guards, not shared behaviour, and drift here would be
//    an upgrade opportunity not a bug) ─────────────────────────────────

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
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "search" });
  return {
    ...buildPageMetadata({
      locale,
      tail: "/search",
      title: t("page_title"),
      description: t("page_description"),
    }),
    // Don't index the search results page itself — the query strings would
    // balloon the index with low-value URLs. The products it links to are
    // already in the sitemap.
    robots: { index: false, follow: true },
  };
}

// Skincare routine-step tiles rendered on the zero-result state. Each maps a
// conceptual step onto a real `?category=` slug from our taxonomy.
const RITUAL_STEPS = [
  {
    step: "01",
    kr: "세안",
    labelKey: "ritual_cleanse",
    bodyKey: "ritual_cleanse_body",
    categorySlug: "cleansers",
  },
  {
    step: "02",
    kr: "집중",
    labelKey: "ritual_treat",
    bodyKey: "ritual_treat_body",
    categorySlug: "essences",
  },
  {
    step: "03",
    kr: "보습",
    labelKey: "ritual_moisturise",
    bodyKey: "ritual_moisturise_body",
    categorySlug: "moisturisers",
  },
  {
    step: "04",
    kr: "보호",
    labelKey: "ritual_protect",
    bodyKey: "ritual_protect_body",
    categorySlug: "sun-care",
  },
] as const;

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const rawQuery = sp.q?.toString() ?? "";
  const query = rawQuery.trim().slice(0, 120); // defensive length cap

  const t = await getTranslations("search");

  // The zero-result title + body are admin-editable so an admin can speak to
  // "nothing to show" visitors in her own voice. Everything else on this
  // page (eyebrow, counts, skincare routine tiles, brand strip) stays in messages.
  // siteCopyOr() honours the SITE_COPY_VOID sentinel — returns "" when
  // an admin hides the field, so the literal "__SITE_COPY_VOID__" string
  // never leaks into the rendered output.
  const copy = await getSiteCopy(locale, ["search.empty"]);
  const emptyTitle = siteCopyOr(copy, "search.empty", "title", t("empty_title"));
  const emptyBody = siteCopyOr(copy, "search.empty", "body", t("empty_body"));

  // ── Parse facet + sort params identically to /shop ────────────────
  const sort = parseSort(sp.sort);
  const categorySlug = sp.category;
  const brandSlugs = parseMulti(sp.brand);
  const skinTypeSlugs = parseMulti(sp.skinType);
  const concernSlugs = parseMulti(sp.concern);
  const ingredientSlugs = parseMulti(sp.ingredient);
  const minPriceEur = parsePrice(sp.minPrice);
  const maxPriceEur = parsePrice(sp.maxPrice);

  // A filter is "active" when the user has narrowed beyond just the
  // text query. Used to decide whether to show the editorial zero-state
  // (only when nothing else is narrowing the search) vs the terse
  // "relax a filter" message (when the filters are likely the reason
  // for the empty result set).
  const hasActiveFacet =
    Boolean(categorySlug) ||
    Boolean(brandSlugs) ||
    Boolean(skinTypeSlugs) ||
    Boolean(concernSlugs) ||
    Boolean(ingredientSlugs) ||
    minPriceEur !== undefined ||
    maxPriceEur !== undefined;

  // Facet sidebar data is only fetched when it'll render — saves a
  // round-trip on the empty-query state and on true zero-hit searches
  // where we show the editorial strips instead.
  const needsFilters = query !== "";

  const [searchResult, filters, brandSuggestions] = await Promise.all([
    query
      ? searchProducts({
          locale,
          query,
          sort,
          take: PAGE_SIZE,
          categorySlug,
          brandSlugs,
          skinTypeSlugs,
          concernSlugs,
          ingredientSlugs,
          minPriceEur,
          maxPriceEur,
        })
      : Promise.resolve({ items: [], total: 0 }),
    needsFilters ? getShopFilters(locale) : Promise.resolve(null),
    // Brand strip only needed for the pure-zero editorial state.
    query && !hasActiveFacet
      ? getTopBrandSuggestions(6)
      : Promise.resolve([]),
  ]);

  const { items: results, total } = searchResult;

  // Which zero-state do we render?
  const showEditorialZero =
    query !== "" && total === 0 && !hasActiveFacet;
  const showFilteredZero =
    query !== "" && total === 0 && hasActiveFacet;
  const hasResults = query !== "" && total > 0;

  return (
    <section className="container py-20 md:py-28">
      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="max-w-xl">
        <div className="eyebrow">{t("eyebrow")}</div>
        <h1 className="mt-3 font-display text-display-lg leading-tight text-ink">
          {query ? t("results_for", { q: query }) : emptyTitle}
        </h1>
        {!query && (
          <p className="mt-6 text-[15px] leading-relaxed text-ink-mid">
            {emptyBody}
          </p>
        )}
        {query && (
          <p className="mt-6 text-[12px] uppercase tracking-label text-ink-mid">
            {total === 1
              ? t("count_one")
              : t("count_other", { count: total })}
          </p>
        )}
      </div>

      <div className="rule my-12" />

      {/* ── Results + filters body ────────────────────────────────── */}
      {/*
        Only render the sidebar layout when a query is present — on an
        empty /search (no `q=`) we keep the page as a gentle prompt
        without facet scaffolding. The sidebar + sort persist across
        both "has results" and "filters returned zero" so the user can
        always adjust refinements without losing their place.
      */}
      {query && filters && (
        <>
          {/* sort row — matches /shop */}
          <div className="flex flex-col gap-6 border-t border-ink/10 pt-8 md:flex-row md:items-center md:justify-end">
            <SortSelect current={sort} />
          </div>

          <div className="mt-10 grid grid-cols-1 gap-12 md:grid-cols-[16rem_1fr] md:gap-16">
            <ShopFiltersShell filters={filters} />

            <div>
              {hasResults && (
                <>
                  {/* 2-up on phones to match /shop grid density. */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-8 lg:grid-cols-3">
                    {results.map((p, i) => (
                      <BestsellerCard
                        key={p.id}
                        product={p}
                        index={i}
                        locale={locale}
                      />
                    ))}
                  </div>

                  {/* If the catalog returned more than we render, nudge
                      toward narrowing. We don't paginate here — the
                      editorial intent of /search is to surface the best
                      matches, not to replicate the /shop infinite grid. */}
                  {total > PAGE_SIZE && (
                    <p className="mt-12 text-[12px] uppercase tracking-label text-ink-mid">
                      {t("too_many_results", {
                        shown: PAGE_SIZE,
                        total,
                      })}
                    </p>
                  )}
                </>
              )}

              {showFilteredZero && (
                <div className="space-y-6">
                  <p className="text-[15px] leading-relaxed text-ink-mid">
                    {t("no_results_with_filters", { q: query })}
                  </p>
                  {/*
                    Direct link back to the same query without any facet
                    params — lets the user drop all refinements in one
                    click. We rebuild only `q` (encoded) so that every
                    brand/category/skinType etc param is dropped.
                  */}
                  <Link
                    href={`/search?q=${encodeURIComponent(query)}`}
                    className="inline-block text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 transition-colors hover:text-vermilion"
                  >
                    {t("clear_filters_cta")}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Editorial zero-state (kept verbatim from prior version) ── */}
      {showEditorialZero && (
        <div className="mt-16 space-y-20">
          {/* ── gentle lede ─────────────────────────────────────── */}
          <p className="text-[15px] leading-relaxed text-ink-mid">
            {t("no_results")}
          </p>

          {/* ── skincare routine-step strip ───────────────────────────────── */}
          <div>
            <div className="max-w-[36ch]">
              <div className="eyebrow">{t("suggest_heading")}</div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-mid">
                {t("suggest_lede")}
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-px bg-ink/10 sm:grid-cols-2 lg:grid-cols-4">
              {RITUAL_STEPS.map((s) => (
                <Link
                  key={s.step}
                  href={`/shop/category/${s.categorySlug}`}
                  className="group flex flex-col gap-4 bg-rice p-8 transition-colors hover:bg-ivory"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-[40px] leading-none text-vermilion">
                      {s.step}
                    </span>
                    <span className="font-kr text-[14px] text-ink-mid">
                      {s.kr}
                    </span>
                  </div>
                  <h3 className="font-display text-[22px] leading-tight text-ink transition-colors group-hover:text-vermilion">
                    {t(s.labelKey)}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-ink-mid">
                    {t(s.bodyKey)}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          {/* ── brand strip (only when the DB actually has brands) ── */}
          {brandSuggestions.length > 0 && (
            <div>
              <div className="eyebrow">{t("suggest_brands_heading")}</div>
              <div className="mt-6 flex flex-wrap gap-2">
                {brandSuggestions.map((b) => (
                  <Link
                    key={b.id}
                    href={`/shop/brand/${b.slug}`}
                    className="inline-flex items-center gap-2 border border-ink/15 bg-white/60 px-4 py-2 text-[13px] text-ink transition-colors hover:border-vermilion hover:text-vermilion"
                  >
                    <span>{b.name}</span>
                    <span className="text-[11px] uppercase tracking-label text-ink-mid">
                      {b.productCount}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── fallback CTA to the full shop ───────────────────── */}
          <Link
            href="/shop"
            className="inline-block text-[12px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-8 transition-colors hover:text-vermilion"
          >
            {t("browse_shop")}
          </Link>
        </div>
      )}
    </section>
  );
}
