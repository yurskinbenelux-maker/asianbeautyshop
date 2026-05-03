// ─────────────────────────────────────────────────────────────────────────
// Product queries — the only place we talk to Prisma for products.
//
// Why a dedicated file:
//   · Keeps data-fetching out of UI files (server components stay thin)
//   · One place to tweak indexes, caching, or locale fallbacks later
//   · Easy to reuse from the shop page, admin, and AI concierge tools
// ─────────────────────────────────────────────────────────────────────────

import { Locale, ProductStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** URL locale ("en") → Prisma enum (Locale.EN). */
export function toPrismaLocale(locale: string): Locale {
  const up = locale.toUpperCase() as keyof typeof Locale;
  return Locale[up] ?? Locale.EN;
}

/**
 * The shape every product card on the site consumes.
 * Prisma's Decimal is serialised to a number at the query boundary
 * so it's safe to pass from server → client components.
 */
export type ProductCardData = {
  id: string;
  sku: string;
  priceEur: number;            // base price, already a plain number
  comparePriceEur: number | null;
  isFeatured: boolean;
  isBestseller: boolean;
  name: string;                // locale-resolved
  slug: string;                // locale-resolved slug (used in URLs)
  tagline: string | null;      // shortDescription from translation
  imageUrl: string | null;     // primary Media.url if any
  imageAlt: string | null;
  /** Social proof — surfaced on shop cards via #150 work. Both fields
   *  reflect ONLY published reviews to avoid leaking moderation state.
   *  reviewCount is 0 when nobody has reviewed yet; reviewAvg is null
   *  in the same case so the card can show "no reviews yet" cleanly
   *  rather than a misleading "0.0 stars". */
  reviewCount: number;
  reviewAvg: number | null;
};

/**
 * Aggregate published-review stats for a batch of products. One groupBy
 * query, returns a Map of productId → { count, avg }. Caller stitches
 * results back into the product list. Avoids N+1 by design.
 */
async function reviewStatsByProductId(
  productIds: string[],
): Promise<Map<string, { count: number; avg: number | null }>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, isPublished: true },
    _count: { _all: true },
    _avg: { rating: true },
  });
  const out = new Map<string, { count: number; avg: number | null }>();
  for (const r of rows) {
    out.set(r.productId, {
      count: r._count._all,
      avg: r._avg.rating ?? null,
    });
  }
  return out;
}

/**
 * getBestsellers — products flagged as bestsellers, ordered by launch date.
 * Returns the translation for the requested locale, falling back to EN.
 */
export async function getBestsellers(
  locale: string,
  limit = 3,
): Promise<ProductCardData[]> {
  const loc = toPrismaLocale(locale);

  const products = await prisma.product.findMany({
    where: {
      status: ProductStatus.PUBLISHED,
      isBestseller: true,
      deletedAt: null,
    },
    orderBy: [{ launchedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      // Fetch target locale + EN fallback; we pick in JS below.
      translations: {
        where: { locale: { in: [loc, Locale.EN] } },
      },
      media: {
        where: { kind: "IMAGE" },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
      },
    },
  });

  // Pull the published-review stats in one extra query so the cards
  // can render "★ 4.7 · 23 reviews" without hitting the DB per product.
  const stats = await reviewStatsByProductId(products.map((p) => p.id));

  return products.map((p) => {
    const tr =
      p.translations.find((t) => t.locale === loc) ??
      p.translations.find((t) => t.locale === Locale.EN);

    const img = p.media[0] ?? null;
    const s = stats.get(p.id);

    return {
      id: p.id,
      sku: p.sku,
      priceEur: Number(p.price),
      comparePriceEur: p.comparePrice ? Number(p.comparePrice) : null,
      isFeatured: p.isFeatured,
      isBestseller: p.isBestseller,
      name: tr?.name ?? p.sku,
      slug: tr?.slug ?? p.sku.toLowerCase(),
      tagline: tr?.shortDescription ?? null,
      imageUrl: img?.url ?? null,
      imageAlt: img?.alt ?? tr?.name ?? null,
      reviewCount: s?.count ?? 0,
      reviewAvg: s?.avg ?? null,
    };
  });
}

// ─── shop listing ──────────────────────────────────────────────────────

export type ShopSort = "newest" | "price_asc" | "price_desc";

/**
 * Filters accepted by the /shop listing. All slug arrays are ANDed with
 * the rest of the where clause but ORed within themselves via `some` —
 * picking "dry" OR "sensitive" under Skin Type widens the result, while
 * adding a Concern on top narrows it. That matches the mental model of
 * facet filters on premium e-commerce sites (Sephora, MECCA).
 */
export type ShopFilterArgs = {
  categorySlug?: string;
  skinTypeSlugs?: string[];
  concernSlugs?: string[];
  brandSlugs?: string[];
  ingredientSlugs?: string[];
  /**
   * Product lines: yur, yur-pro, yur-me. Sourced from Product.productLine.
   * Multi-select with OR semantics across lines.
   */
  lineSlugs?: string[];
  minPriceEur?: number;
  maxPriceEur?: number;
};

/**
 * Canonical product line definitions. Source of truth — every line filter
 * lookup, label, and URL slug derives from here. Adding a fourth line
 * later is a one-row change.
 *
 * Why not a Brand row per line: the company is one brand (YU.R, one VAT,
 * one supplier). The "Pro" and "Me" labels are *sub-lines* within the
 * brand, not separate brands. Modelling them as a Product.productLine
 * column reflects the buyer mental model + keeps the Brand model clean
 * for a future where Sofia stocks a second supplier.
 *
 * `dbValues` is the set of strings that appear in Product.productLine for
 * that line. The default line includes both `null` and the empty string —
 * old imports wrote both depending on whether the supplier sheet had an
 * explicit blank or omitted the cell.
 */
// Labels use U+2022 BULLET (•) per the YU.R brand book — "Yu•R", not
// "Yu.R" or "YU.R". Matches the typography Max requested for the
// front-end line tabs and the admin organize picker.
export const PRODUCT_LINES = [
  { slug: "yur", label: "Yu•R", dbValues: [null as string | null, ""] },
  { slug: "yur-pro", label: "Yu•R Pro", dbValues: ["Yu.R PRO"] },
  { slug: "yur-me", label: "Yu•R Me", dbValues: ["Yu.R Me"] },
] as const;

export type ProductLineSlug = (typeof PRODUCT_LINES)[number]["slug"];

/**
 * Returns the Prisma predicate for a given list of line slugs.
 *
 * A product belongs to line X when EITHER:
 *   · its primary `productLine` matches one of X's dbValues, OR
 *   · its `extraLines` array contains one of X's non-null dbValues
 *
 * The second arm is what lets a single product (e.g. a gift card) live
 * under every line tab — Sofia ticks all 3 boxes in admin and the rest
 * of the line's non-primary memberships go into extraLines.
 */
function lineWhere(slugs: string[]): Prisma.ProductWhereInput {
  const orClauses: Prisma.ProductWhereInput[] = [];
  for (const s of slugs) {
    const def = PRODUCT_LINES.find((l) => l.slug === s);
    if (!def) continue;
    for (const v of def.dbValues) {
      if (v === null) {
        // Default Yu•R line covers null/empty AND any product whose
        // extraLines contains an explicit "Yu.R" sentinel for opt-in.
        orClauses.push({ productLine: null });
      } else {
        // Primary match.
        orClauses.push({ productLine: v });
        // Secondary match — product opted into this line via the
        // multi-select on the Organise tab.
        orClauses.push({ extraLines: { has: v } });
      }
    }
  }
  return orClauses.length > 0 ? { OR: orClauses } : {};
}

/**
 * Build the Prisma where clause shared by getShopProducts + the facet
 * counters in getShopFilters. Kept as its own function so we can't drift
 * between "what the grid shows" and "what the sidebar counts".
 */
function buildShopWhere(filters: ShopFilterArgs): Prisma.ProductWhereInput {
  const AND: Prisma.ProductWhereInput[] = [
    { status: ProductStatus.PUBLISHED },
    { deletedAt: null },
  ];

  if (filters.categorySlug) {
    AND.push({
      categories: { some: { category: { slug: filters.categorySlug } } },
    });
  }
  if (filters.skinTypeSlugs?.length) {
    AND.push({
      skinTypes: {
        some: { skinType: { slug: { in: filters.skinTypeSlugs } } },
      },
    });
  }
  if (filters.concernSlugs?.length) {
    AND.push({
      concerns: {
        some: { concern: { slug: { in: filters.concernSlugs } } },
      },
    });
  }
  if (filters.brandSlugs?.length) {
    AND.push({ brand: { slug: { in: filters.brandSlugs } } });
  }
  if (filters.lineSlugs?.length) {
    AND.push(lineWhere(filters.lineSlugs));
  }
  if (filters.ingredientSlugs?.length) {
    AND.push({
      ingredients: {
        some: { ingredient: { slug: { in: filters.ingredientSlugs } } },
      },
    });
  }
  if (filters.minPriceEur !== undefined) {
    AND.push({ price: { gte: filters.minPriceEur } });
  }
  if (filters.maxPriceEur !== undefined) {
    AND.push({ price: { lte: filters.maxPriceEur } });
  }

  return { AND };
}

/**
 * getShopProducts — paginated listing used by /shop.
 * Filters by category, skin types, concerns, brands, ingredients, and a
 * price range. All filters are optional; the unfiltered call returns
 * every published product, newest first. Respects soft-delete.
 */
export async function getShopProducts({
  locale,
  sort = "newest",
  take = 24,
  skip = 0,
  ...filters
}: {
  locale: string;
  sort?: ShopSort;
  take?: number;
  skip?: number;
} & ShopFilterArgs): Promise<{ items: ProductCardData[]; total: number }> {
  const loc = toPrismaLocale(locale);

  const where = buildShopWhere(filters);

  const orderBy =
    sort === "price_asc"
      ? [{ price: "asc" as const }]
      : sort === "price_desc"
      ? [{ price: "desc" as const }]
      : [{ launchedAt: "desc" as const }, { createdAt: "desc" as const }];

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      take,
      skip,
      include: {
        translations: { where: { locale: { in: [loc, Locale.EN] } } },
        media: {
          where: { kind: "IMAGE" },
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          take: 1,
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  // One extra round-trip for the review aggregates so cards can render
  // "★ 4.7 · 23 reviews". Empty when the page is empty.
  const stats = await reviewStatsByProductId(products.map((p) => p.id));

  const items = products.map((p) => {
    const tr =
      p.translations.find((t) => t.locale === loc) ??
      p.translations.find((t) => t.locale === Locale.EN);
    const img = p.media[0] ?? null;
    const s = stats.get(p.id);
    return {
      id: p.id,
      sku: p.sku,
      priceEur: Number(p.price),
      comparePriceEur: p.comparePrice ? Number(p.comparePrice) : null,
      isFeatured: p.isFeatured,
      isBestseller: p.isBestseller,
      name: tr?.name ?? p.sku,
      slug: tr?.slug ?? p.sku.toLowerCase(),
      tagline: tr?.shortDescription ?? null,
      imageUrl: img?.url ?? null,
      imageAlt: img?.alt ?? tr?.name ?? null,
      reviewCount: s?.count ?? 0,
      reviewAvg: s?.avg ?? null,
    };
  });

  return { items, total };
}

/**
 * getShopCategories — used by the filter row on /shop.
 * Returns every active category with its translated name, plus the
 * count of products currently living in it.
 *
 * When `lineSlugs` is passed (e.g. the customer picked Yu•R Pro from
 * the line tabs), counts are scoped to products in that line AND
 * categories with zero matching products are dropped — otherwise the
 * strip turns into "0 PRODUCTS" noise. Categories that still have
 * inventory across the whole catalogue are shown either way; the
 * filtering happens via productLine on the join.
 */
export async function getShopCategories(
  locale: string,
  { lineSlugs }: { lineSlugs?: string[] } = {},
): Promise<Array<{ slug: string; name: string; count: number }>> {
  const loc = toPrismaLocale(locale);

  // Combined where for the count subquery — published, not deleted, and
  // (when filtering by line) restricted to that line's productLine values.
  const baseProductWhere: Prisma.ProductWhereInput = {
    status: ProductStatus.PUBLISHED,
    deletedAt: null,
  };
  const productWhere: Prisma.ProductWhereInput =
    lineSlugs && lineSlugs.length > 0
      ? { AND: [baseProductWhere, lineWhere(lineSlugs)] }
      : baseProductWhere;

  const cats = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      translations: { where: { locale: { in: [loc, Locale.EN] } } },
      _count: {
        select: {
          products: {
            where: { product: productWhere },
          },
        },
      },
    },
  });

  const mapped = cats.map((c) => {
    const tr =
      c.translations.find((t) => t.locale === loc) ??
      c.translations.find((t) => t.locale === Locale.EN);
    return {
      slug: c.slug,
      name: tr?.name ?? c.slug,
      count: c._count.products,
    };
  });

  // When a line filter is active, hide categories with zero matches —
  // they only confuse. Without a line filter we keep zeros (Sofia may be
  // staging a new shelf and wants the chip to render as "MORE" candidate).
  if (lineSlugs && lineSlugs.length > 0) {
    return mapped.filter((c) => c.count > 0);
  }
  return mapped;
}

/**
 * Shape the /shop/category/[slug] landing page needs: category hero data
 * (name, description HTML, SEO fields, icon) resolved to the requested
 * locale with EN fallback. Returns null when the slug doesn't match an
 * active category so the page can 404.
 */
export type ShopCategoryLanding = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  iconUrl: string | null;
};

export async function getShopCategoryBySlug(
  locale: string,
  slug: string,
): Promise<ShopCategoryLanding | null> {
  const loc = toPrismaLocale(locale);

  const category = await prisma.category.findUnique({
    where: { slug },
    include: {
      translations: { where: { locale: { in: [loc, Locale.EN] } } },
    },
  });
  if (!category || !category.isActive) return null;

  const tr =
    category.translations.find((t) => t.locale === loc) ??
    category.translations.find((t) => t.locale === Locale.EN);

  return {
    id: category.id,
    slug: category.slug,
    name: tr?.name ?? category.slug,
    description: tr?.description ?? null,
    seoTitle: tr?.seoTitle ?? null,
    seoDescription: tr?.seoDescription ?? null,
    iconUrl: category.iconUrl,
  };
}

/**
 * Shape the /shop/brand/[slug] landing page needs: brand hero data
 * resolved to the requested locale with EN fallback. `tagline` and
 * `story` come from BrandTranslation; `name` and `logoUrl` live on the
 * Brand row (shared across locales). Returns null when the slug
 * doesn't match an active brand so the page can 404.
 */
export type ShopBrandLanding = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  story: string | null;
  logoUrl: string | null;
  updatedAt: Date;
};

export async function getShopBrandBySlug(
  locale: string,
  slug: string,
): Promise<ShopBrandLanding | null> {
  const loc = toPrismaLocale(locale);

  const brand = await prisma.brand.findUnique({
    where: { slug },
    include: {
      translations: { where: { locale: { in: [loc, Locale.EN] } } },
    },
  });
  if (!brand || !brand.isActive) return null;

  const tr =
    brand.translations.find((t) => t.locale === loc) ??
    brand.translations.find((t) => t.locale === Locale.EN);

  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    tagline: tr?.tagline ?? null,
    story: tr?.story ?? null,
    logoUrl: brand.logoUrl,
    updatedAt: brand.updatedAt,
  };
}

// ─── shop facets (sidebar data) ────────────────────────────────────────

export type ShopFilterTaxon = {
  slug: string;
  label: string;
  count: number;
};

export type ShopFilters = {
  skinTypes: ShopFilterTaxon[];
  concerns: ShopFilterTaxon[];
  brands: ShopFilterTaxon[];
  /**
   * Product lines (Yu.R / Yu.R Pro / Yu.R Me). Counts are scoped to
   * published products and reflect each line's actual inventory volume.
   * Always emitted in PRODUCT_LINES order, never alphabetised — Sofia
   * cares about the Pro/Me hierarchy reading consistently.
   */
  lines: ShopFilterTaxon[];
  ingredients: ShopFilterTaxon[];
  /** Cheapest / most expensive published product — used to seed the range slider. */
  priceMinEur: number;
  priceMaxEur: number;
};

/**
 * getShopFilters — one round-trip of all the facet data the sidebar needs.
 *
 * Counts are scoped to *published, non-deleted* products so empty/draft
 * inventory doesn't pad the numbers. We intentionally do NOT apply the
 * *current* user-selected filters here — we want the full list of options
 * with their natural counts so the user can always see (and add) other
 * facets. The grid itself does the final narrowing.
 *
 * Ingredients are optionally capped to the most-used ones because Sofia
 * can create hundreds of INCI rows and a 300-item sidebar is unusable.
 */
export async function getShopFilters(
  locale: string,
  { ingredientLimit = 30 }: { ingredientLimit?: number } = {},
): Promise<ShopFilters> {
  const loc = toPrismaLocale(locale);

  const publishedProduct = {
    status: ProductStatus.PUBLISHED,
    deletedAt: null,
  } as const;

  const [skinTypes, concerns, brands, ingredients, priceAgg, lineGroups] =
    await Promise.all([
      prisma.skinType.findMany({
        orderBy: { slug: "asc" },
        include: {
          translations: { where: { locale: { in: [loc, Locale.EN] } } },
          _count: {
            select: {
              productLinks: { where: { product: publishedProduct } },
            },
          },
        },
      }),
      prisma.concern.findMany({
        orderBy: { slug: "asc" },
        include: {
          translations: { where: { locale: { in: [loc, Locale.EN] } } },
          _count: {
            select: {
              productLinks: { where: { product: publishedProduct } },
            },
          },
        },
      }),
      prisma.brand.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: { products: { where: publishedProduct } },
          },
        },
      }),
      prisma.ingredient.findMany({
        orderBy: [{ isKeyAsset: "desc" }, { inciName: "asc" }],
        take: ingredientLimit,
        include: {
          translations: { where: { locale: { in: [loc, Locale.EN] } } },
          _count: {
            select: {
              productLinks: { where: { product: publishedProduct } },
            },
          },
        },
      }),
      prisma.product.aggregate({
        where: publishedProduct,
        _min: { price: true },
        _max: { price: true },
      }),
      // Pull every published product's productLine + extraLines so we can
      // count line memberships in JS. We can't use a single groupBy here
      // because extraLines is a Postgres text[] — Prisma's groupBy doesn't
      // expand array elements. With 35-100 products the JS aggregation is
      // a few microseconds, well under the savings of avoiding 3 extra
      // count queries.
      prisma.product.findMany({
        where: publishedProduct,
        select: { productLine: true, extraLines: true },
      }),
    ]);

  const labelFor = <T extends { locale: Locale; label: string }>(
    rows: T[],
  ): string | undefined =>
    rows.find((r) => r.locale === loc)?.label ??
    rows.find((r) => r.locale === Locale.EN)?.label;

  return {
    skinTypes: skinTypes
      .map((s) => ({
        slug: s.slug,
        label: labelFor(s.translations) ?? s.slug,
        count: s._count.productLinks,
      }))
      // Hide taxons nobody uses; otherwise the sidebar reads as a wishlist.
      .filter((s) => s.count > 0),
    concerns: concerns
      .map((c) => ({
        slug: c.slug,
        label: labelFor(c.translations) ?? c.slug,
        count: c._count.productLinks,
      }))
      .filter((c) => c.count > 0),
    brands: brands
      .map((b) => ({
        slug: b.slug,
        label: b.name,
        count: b._count.products,
      }))
      .filter((b) => b.count > 0),
    // Line counts are computed by walking every published product once
    // and bumping each line bucket the product belongs to (primary
    // productLine match OR extraLines membership). A single product
    // appearing in all three lines (e.g. a gift card) is therefore
    // counted three times — which is exactly what the line tabs want
    // to surface.
    lines: PRODUCT_LINES.map((l) => {
      const dbValues = l.dbValues as readonly (string | null)[];
      const nonNullValues = dbValues.filter(
        (v): v is string => v !== null,
      );
      let count = 0;
      for (const p of lineGroups) {
        const matchesPrimary = dbValues.includes(p.productLine);
        const matchesExtra = nonNullValues.some((v) =>
          p.extraLines.includes(v),
        );
        if (matchesPrimary || matchesExtra) count += 1;
      }
      return { slug: l.slug, label: l.label, count };
    }),
    ingredients: ingredients
      .map((i) => {
        const tr =
          i.translations.find((t) => t.locale === loc) ??
          i.translations.find((t) => t.locale === Locale.EN);
        return {
          slug: i.slug,
          label: tr?.displayName ?? i.inciName,
          count: i._count.productLinks,
        };
      })
      .filter((i) => i.count > 0),
    // Round bounds to whole euros so the slider snaps cleanly. Defaults
    // protect against the empty-catalogue case (new installs).
    priceMinEur: priceAgg._min.price
      ? Math.floor(Number(priceAgg._min.price))
      : 0,
    priceMaxEur: priceAgg._max.price
      ? Math.ceil(Number(priceAgg._max.price))
      : 100,
  };
}

// ─── product detail ────────────────────────────────────────────────────

/**
 * Full shape used by the PDP. Kept distinct from ProductCardData because
 * detail pages need rich HTML, galleries, volume, and cross-locale slugs
 * (so the language switcher can link to the same product in Dutch).
 */
export type ProductDetail = {
  id: string;
  sku: string;
  /**
   * "STANDARD" for ordinary skincare. "GIFT_CARD" turns the PDP into a
   * configurable digital good — denomination picker + recipient form.
   */
  kind: "STANDARD" | "GIFT_CARD";
  priceEur: number;
  comparePriceEur: number | null;
  volumeMl: number | null;
  isFeatured: boolean;
  isBestseller: boolean;
  /** Includes slug + country so the PDP can render "Made in {brand-country}". */
  brand: { name: string; slug: string; country: string | null } | null;
  // locale-resolved translation
  name: string;
  slug: string;
  tagline: string | null;
  descriptionHtml: string;
  howToUseHtml: string | null;
  warningsText: string | null;
  // ─── Supplier-spec fields surfaced from Product ─────────────────────
  productLine: string | null;
  barcode: string | null;
  shelfLifeMonths: number | null;
  originCountry: string | null;     // ISO-3166 alpha-2
  hsCode: string | null;
  audienceCategory: string;          // enum value as string
  inciList: string | null;
  // full gallery
  images: Array<{ url: string; alt: string | null }>;
  // slugs in every locale, used by the LocaleSwitcher on this page
  slugByLocale: Partial<Record<Locale, string>>;
  // primary category slug for breadcrumb + related lookup
  primaryCategorySlug: string | null;
  primaryCategoryName: string | null;
};

export async function getProductBySlug({
  locale,
  slug,
  allowUnpublished = false,
}: {
  locale: string;
  slug: string;
  /**
   * When true, DRAFT and ARCHIVED products are also returned. Used by the
   * admin "Preview as customer" flow so Sofia can QA a product page before
   * flipping it to PUBLISHED. The caller MUST gate this behind an admin
   * auth check — never pass `true` based on an untrusted query param alone.
   * Soft-deleted products (`deletedAt`) remain hidden in either mode.
   */
  allowUnpublished?: boolean;
}): Promise<ProductDetail | null> {
  const loc = toPrismaLocale(locale);

  // We look up by (locale, slug) — unique in our schema.
  const tr = await prisma.productTranslation.findFirst({
    where: { locale: loc, slug },
    include: {
      product: {
        include: {
          brand: { include: { translations: { where: { locale: loc } } } },
          translations: true, // every locale (for the switcher)
          media: {
            where: { kind: "IMAGE" },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          },
          categories: {
            include: {
              category: {
                include: {
                  translations: { where: { locale: { in: [loc, Locale.EN] } } },
                },
              },
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!tr || tr.product.deletedAt) {
    return null;
  }
  if (!allowUnpublished && tr.product.status !== ProductStatus.PUBLISHED) {
    return null;
  }

  const p = tr.product;

  // Build a { EN: "rice-water-cleanser", NL: "rijstwater-reiniger", … } map
  // so the language switcher can preserve context across languages.
  const slugByLocale: Partial<Record<Locale, string>> = {};
  for (const t of p.translations) slugByLocale[t.locale] = t.slug;

  const primaryCategoryLink = p.categories[0];
  const primaryCategoryTr =
    primaryCategoryLink?.category.translations.find((t) => t.locale === loc) ??
    primaryCategoryLink?.category.translations.find((t) => t.locale === Locale.EN);

  return {
    id: p.id,
    sku: p.sku,
    kind: p.kind === "GIFT_CARD" ? "GIFT_CARD" : "STANDARD",
    priceEur: Number(p.price),
    comparePriceEur: p.comparePrice ? Number(p.comparePrice) : null,
    volumeMl: p.volumeMl,
    isFeatured: p.isFeatured,
    isBestseller: p.isBestseller,
    brand: p.brand
      ? { name: p.brand.name, slug: p.brand.slug, country: p.brand.country }
      : null,
    name: tr.name,
    slug: tr.slug,
    tagline: tr.shortDescription,
    descriptionHtml: tr.description,
    howToUseHtml: tr.howToUse,
    warningsText: tr.warnings,
    productLine: p.productLine,
    barcode: p.barcode,
    shelfLifeMonths: p.shelfLifeMonths,
    originCountry: p.originCountry,
    hsCode: p.hsCode,
    audienceCategory: p.audienceCategory,
    inciList: p.inciList,
    images: p.media.map((m) => ({ url: m.url, alt: m.alt })),
    slugByLocale,
    primaryCategorySlug: primaryCategoryLink?.category.slug ?? null,
    primaryCategoryName: primaryCategoryTr?.name ?? null,
  };
}

/**
 * Related products — uses the ProductRelated table if admin has curated
 * relations, otherwise falls back to other products in the same category.
 * Always excludes the current product itself.
 */
export async function getRelatedProducts({
  locale,
  productId,
  categorySlug,
  limit = 3,
}: {
  locale: string;
  productId: string;
  categorySlug: string | null;
  limit?: number;
}): Promise<ProductCardData[]> {
  const loc = toPrismaLocale(locale);

  // 1) Curated relations first
  const related = await prisma.productRelated.findMany({
    where: { fromId: productId },
    orderBy: { sortOrder: "asc" },
    take: limit,
    include: {
      to: {
        include: {
          translations: { where: { locale: { in: [loc, Locale.EN] } } },
          media: {
            where: { kind: "IMAGE" },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            take: 1,
          },
        },
      },
    },
  });

  let products = related
    .map((r) => r.to)
    .filter(
      (p) =>
        p.status === ProductStatus.PUBLISHED && p.deletedAt === null,
    );

  // 2) Fallback — category siblings
  if (products.length === 0 && categorySlug) {
    products = await prisma.product.findMany({
      where: {
        id: { not: productId },
        status: ProductStatus.PUBLISHED,
        deletedAt: null,
        categories: { some: { category: { slug: categorySlug } } },
      },
      orderBy: [{ isBestseller: "desc" }, { launchedAt: "desc" }],
      take: limit,
      include: {
        translations: { where: { locale: { in: [loc, Locale.EN] } } },
        media: {
          where: { kind: "IMAGE" },
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          take: 1,
        },
      },
    });
  }

  const stats = await reviewStatsByProductId(products.map((p) => p.id));

  return products.map((p) => {
    const t =
      p.translations.find((x) => x.locale === loc) ??
      p.translations.find((x) => x.locale === Locale.EN);
    const img = p.media[0] ?? null;
    const s = stats.get(p.id);
    return {
      id: p.id,
      sku: p.sku,
      priceEur: Number(p.price),
      comparePriceEur: p.comparePrice ? Number(p.comparePrice) : null,
      isFeatured: p.isFeatured,
      isBestseller: p.isBestseller,
      name: t?.name ?? p.sku,
      slug: t?.slug ?? p.sku.toLowerCase(),
      tagline: t?.shortDescription ?? null,
      imageUrl: img?.url ?? null,
      imageAlt: img?.alt ?? t?.name ?? null,
      reviewCount: s?.count ?? 0,
      reviewAvg: s?.avg ?? null,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Global search — used by /search and the header search overlay.
//
// We match against the translated ProductTranslation.name,
// shortDescription, and the Brand.name / slug. We do NOT honour
// `hideFromSearch` products, and we drop draft / archived / soft-deleted.
//
// Matching strategy is intentionally simple (case-insensitive `contains`)
// — the catalog is small (dozens of SKUs), and the locale-resolved
// translation table makes full-text ranking overkill. If the catalog
// ever grows past a few hundred items we can add pg_trgm and ts_vector.
//
// Faceted search: callers can pass the same `ShopFilterArgs` + `sort` that
// /shop uses. The text match is AND-combined with the facet where clause,
// so /search supports brand, category, concern, ingredient, skin-type, and
// price filters identically to /shop — letting customers narrow ambiguous
// queries ("cleanser" returns dozens; add brand=cosrx and you get four).
// ─────────────────────────────────────────────────────────────────────────

export async function searchProducts({
  locale,
  query,
  sort = "newest",
  take = 24,
  skip = 0,
  ...filters
}: {
  locale: string;
  query: string;
  sort?: ShopSort;
  take?: number;
  skip?: number;
} & ShopFilterArgs): Promise<{ items: ProductCardData[]; total: number }> {
  const q = query.trim();
  if (!q) return { items: [], total: 0 };
  const loc = toPrismaLocale(locale);

  // Split on whitespace so "rice cleanser" matches "Rice Water Cleanser"
  // even though the words are non-adjacent. We AND the terms so a two-
  // word query is stricter than a one-word one.
  const terms = q.split(/\s+/).filter((t) => t.length > 0).slice(0, 6);

  // For each term, a product must match EITHER in a translation field
  // (in the current locale or English fallback) or in the brand's name.
  const termConditions: Prisma.ProductWhereInput[] = terms.map((term) => ({
    OR: [
      {
        translations: {
          some: {
            locale: { in: [loc, Locale.EN] },
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { shortDescription: { contains: term, mode: "insensitive" as const } },
            ],
          },
        },
      },
      {
        brand: {
          OR: [
            { name: { contains: term, mode: "insensitive" as const } },
            { slug: { contains: term, mode: "insensitive" as const } },
          ],
        },
      },
      { sku: { contains: term, mode: "insensitive" as const } },
    ],
  }));

  // Reuse the /shop where-builder so facet semantics stay in one place.
  // buildShopWhere already includes the PUBLISHED + deletedAt scope; we
  // layer on `hideFromSearch: false` (search-specific) plus the term
  // conditions. Casting AND to the array shape we know buildShopWhere returns.
  const facetAnd =
    (buildShopWhere(filters).AND as Prisma.ProductWhereInput[]) ?? [];

  const where: Prisma.ProductWhereInput = {
    AND: [...facetAnd, { hideFromSearch: false }, ...termConditions],
  };

  // Sort follows /shop for price ordering. For "newest" on search we keep
  // the original behaviour of floating bestsellers + featured first — a
  // query like "cream" benefits from the editorial hand-picking more than
  // the shop grid does (where newest-first is the clearer contract).
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    sort === "price_asc"
      ? [{ price: "asc" as const }]
      : sort === "price_desc"
      ? [{ price: "desc" as const }]
      : [
          { isBestseller: "desc" as const },
          { isFeatured: "desc" as const },
          { launchedAt: "desc" as const },
          { createdAt: "desc" as const },
        ];

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        translations: { where: { locale: { in: [loc, Locale.EN] } } },
        media: {
          where: { kind: "IMAGE" },
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          take: 1,
        },
      },
      orderBy,
      take,
      skip,
    }),
    prisma.product.count({ where }),
  ]);

  const stats = await reviewStatsByProductId(products.map((p) => p.id));

  const items = products.map((p) => {
    const t =
      p.translations.find((x) => x.locale === loc) ??
      p.translations.find((x) => x.locale === Locale.EN);
    const img = p.media[0];
    const s = stats.get(p.id);
    return {
      id: p.id,
      sku: p.sku,
      priceEur: Number(p.price),
      comparePriceEur: p.comparePrice ? Number(p.comparePrice) : null,
      isFeatured: p.isFeatured,
      isBestseller: p.isBestseller,
      name: t?.name ?? p.sku,
      slug: t?.slug ?? p.sku.toLowerCase(),
      tagline: t?.shortDescription ?? null,
      imageUrl: img?.url ?? null,
      imageAlt: img?.alt ?? t?.name ?? null,
      reviewCount: s?.count ?? 0,
      reviewAvg: s?.avg ?? null,
    };
  });

  return { items, total };
}

// ─────────────────────────────────────────────────────────────────────────
// Sitemap helpers — enumerate every published product's localised slug
// across all four locales, plus a shared updatedAt for <lastmod>.
//
// Shape returned:
//   [{ id, updatedAt, slugByLocale: { EN: "...", NL: "...", FR: "...", RU: "..." } }]
//
// A product may be missing a translation for a given locale — when that
// happens the consumer (sitemap.ts) should fall back to the EN slug so the
// URL is always reachable under /en/shop/<slug>.
// ─────────────────────────────────────────────────────────────────────────

export type ProductSitemapEntry = {
  id: string;
  updatedAt: Date;
  slugByLocale: Partial<Record<Locale, string>>;
};

export async function getAllPublishedProductSlugs(): Promise<
  ProductSitemapEntry[]
> {
  const products = await prisma.product.findMany({
    where: { status: ProductStatus.PUBLISHED, deletedAt: null },
    select: {
      id: true,
      updatedAt: true,
      translations: { select: { locale: true, slug: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return products.map((p) => {
    const slugByLocale: Partial<Record<Locale, string>> = {};
    for (const t of p.translations) slugByLocale[t.locale] = t.slug;
    return { id: p.id, updatedAt: p.updatedAt, slugByLocale };
  });
}

/**
 * getAllActiveCategorySlugs — category slugs for the sitemap.
 *
 * Category slugs are shared across locales (they live on Category, not on
 * CategoryTranslation), so a single slug emits four sitemap entries —
 * one per locale under /[locale]/shop/category/<slug>. `updatedAt` is
 * the category row's, so Google sees a fresh stamp when Sofia edits
 * its hero copy.
 */
export type CategorySitemapEntry = {
  slug: string;
  updatedAt: Date;
};

export async function getAllActiveCategorySlugs(): Promise<
  CategorySitemapEntry[]
> {
  const cats = await prisma.category.findMany({
    where: { isActive: true },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return cats.map((c) => ({ slug: c.slug, updatedAt: c.updatedAt }));
}

/**
 * getAllActiveBrandSlugs — brand slugs for the sitemap.
 *
 * Same treatment as category slugs: shared across locales, one entry
 * per (slug, locale) pair. Only active brands are emitted — Sofia may
 * be staging a new brand and we don't want Google to find a
 * not-yet-launched URL.
 */
export type BrandSitemapEntry = {
  slug: string;
  updatedAt: Date;
};

export async function getAllActiveBrandSlugs(): Promise<
  BrandSitemapEntry[]
> {
  const brands = await prisma.brand.findMany({
    where: { isActive: true },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return brands.map((b) => ({ slug: b.slug, updatedAt: b.updatedAt }));
}

// ─────────────────────────────────────────────────────────────────────────
// Brand suggestions — used by the /search zero-result strip.
//
// Returns up to `take` active brands that actually have at least one
// published, non-deleted product. Ordered by product count desc (so the
// strongest brands show first) and alphabetically as a tie-breaker.
// ─────────────────────────────────────────────────────────────────────────

export type BrandSuggestion = {
  id: string;
  slug: string;
  name: string;
  productCount: number;
};

export async function getTopBrandSuggestions(
  take = 6,
): Promise<BrandSuggestion[]> {
  const brands = await prisma.brand.findMany({
    where: {
      isActive: true,
      products: {
        some: { status: ProductStatus.PUBLISHED, deletedAt: null },
      },
    },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          products: {
            where: { status: ProductStatus.PUBLISHED, deletedAt: null },
          },
        },
      },
    },
  });

  return brands
    .map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      productCount: b._count.products,
    }))
    .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name))
    .slice(0, take);
}
