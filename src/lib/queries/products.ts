// ─────────────────────────────────────────────────────────────────────────
// Product queries — the only place we talk to Prisma for products.
//
// Why a dedicated file:
//   · Keeps data-fetching out of UI files (server components stay thin)
//   · One place to tweak indexes, caching, or locale fallbacks later
//   · Easy to reuse from the shop page, admin, and AI concierge tools
// ─────────────────────────────────────────────────────────────────────────

import { Locale, ProductKind, ProductStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** URL locale ("en") → Prisma enum (Locale.EN). */
export function toPrismaLocale(locale: string): Locale {
  const up = locale.toUpperCase() as keyof typeof Locale;
  return Locale[up] ?? Locale.EN;
}

/**
 * Apply Product.isOnSale + salePercent to compute the four card price
 * fields in one place. Used by every ProductCardData builder so a
 * change to the sale formula (e.g. cap at 80% instead of 90%) only
 * needs to land here.
 *
 * Mirrors `priceForDisplay()` in src/lib/pricing/sale.ts but maps the
 * result to ProductCardData's exact field names.
 */
function applyCardSale(p: {
  price: Prisma.Decimal | number | string;
  isOnSale: boolean;
  salePercent: number | null;
}): {
  priceEur: number;
  isOnSale: boolean;
  originalPriceEur: number | null;
  discountPercent: number | null;
} {
  const base = Math.round(Number(p.price) * 100) / 100;
  if (!p.isOnSale || !p.salePercent || p.salePercent <= 0) {
    return {
      priceEur: base,
      isOnSale: false,
      originalPriceEur: null,
      discountPercent: null,
    };
  }
  const pct = Math.min(90, Math.max(0, p.salePercent));
  const discounted = Math.round(base * (1 - pct / 100) * 100) / 100;
  return {
    priceEur: discounted,
    isOnSale: true,
    originalPriceEur: base,
    discountPercent: pct,
  };
}

/**
 * The shape every product card on the site consumes.
 * Prisma's Decimal is serialised to a number at the query boundary
 * so it's safe to pass from server → client components.
 */
export type ProductCardData = {
  id: string;
  sku: string;
  /** The price the customer actually pays. For non-sale products this
   *  is the regular Product.price. For on-sale products this is the
   *  discounted price (price × (1 - salePercent/100)). */
  priceEur: number;
  comparePriceEur: number | null;
  /** Sale display fields. When `isOnSale` is true, `originalPriceEur`
   *  carries the regular price (for strikethrough) and `discountPercent`
   *  carries the % off (for the "−X%" chip). Both null otherwise. */
  isOnSale: boolean;
  originalPriceEur: number | null;
  discountPercent: number | null;
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
  /**
   * Product kind — distinguishes physical products from gift cards.
   * Surfaced on the card so the quick-view modal can decide whether
   * one-tap "Add to cart" is safe: gift cards always need a per-line
   * recipient config and must therefore route to the full PDP.
   */
  kind: ProductKind;
  /**
   * True when the product has more than one variant the customer can
   * choose between (50ml vs 100ml, Travel vs Standard, etc). When true,
   * quick-view should send the customer to the full PDP to pick the
   * variant — there's no selector in quick-view. False for single-
   * variant products and gift cards.
   */
  hasOptions: boolean;
  /**
   * True when at least one variant has positive stock — i.e. the product
   * is actually purchasable right now. Gift cards short-circuit to true
   * (digital, never out of stock). Products with no variants at all
   * (legacy data) also short-circuit to true because they have no stock
   * concept. Quick-view uses this to hide the "Add to cart" button on
   * a fully out-of-stock product so we don't deceive shoppers with a
   * silent no-op.
   */
  isInStock: boolean;
};

/**
 * Derive the three "cart-ability" fields from a product + its variants.
 * Single source of truth used by every ProductCardData builder so a
 * change to the stock rule (e.g. "gift cards CAN go out of stock") only
 * lands in one place.
 */
function cardCartFlags(p: {
  kind: ProductKind;
  variants: Array<{ stock: number }>;
}): { kind: ProductKind; hasOptions: boolean; isInStock: boolean } {
  // Gift cards: always in stock, never have option choice in quick view
  // (the recipient form lives on the PDP, not on a variant selector).
  if (p.kind === ProductKind.GIFT_CARD) {
    return { kind: p.kind, hasOptions: false, isInStock: true };
  }
  const hasOptions = p.variants.length > 1;
  const isInStock =
    p.variants.length === 0
      ? true // no variants = no stock concept, legacy products
      : p.variants.some((v) => v.stock > 0);
  return { kind: p.kind, hasOptions, isInStock };
}

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
      variants: { select: { stock: true } },
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
      ...applyCardSale(p),
      comparePriceEur: p.comparePrice ? Number(p.comparePrice) : null,
      isFeatured: p.isFeatured,
      isBestseller: p.isBestseller,
      name: tr?.name ?? p.sku,
      slug: tr?.slug ?? p.sku.toLowerCase(),
      tagline: tr?.shortDescription ?? null,
      imageUrl: img?.url ?? null,
      imageAlt: img?.alt ?? tr?.name ?? null,
      ...cardCartFlags(p),
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
  /**
   * Locked filters used by the dedicated /sale and /new pages.
   * `onSaleOnly: true` restricts to products with isOnSale=true.
   * `isNewOnly:  true` restricts to products with isNew=true.
   * Always merged into the where clause regardless of URL params, so
   * the customer can still narrow by category/brand/etc within the
   * already-filtered set.
   */
  onSaleOnly?: boolean;
  isNewOnly?: boolean;
};

/**
 * Canonical product line definitions. Source of truth — every line filter
 * lookup, label, and URL slug derives from here. Adding a fourth line
 * later is a one-row change.
 *
 * Why not a Brand row per line: the company is one brand (Asian Beauty Shop, one VAT,
 * one supplier). The "Pro" and "Me" labels are *sub-lines* within the
 * brand, not separate brands. Modelling them as a Product.productLine
 * column reflects the buyer mental model + keeps the Brand model clean
 * for a future where an admin stocks a second supplier.
 *
 * `dbValues` is the set of strings that appear in Product.productLine for
 * that line. The default line includes both `null` and the empty string —
 * old imports wrote both depending on whether the supplier sheet had an
 * explicit blank or omitted the cell.
 */
// Labels use U+2022 BULLET (•) per the Asian Beauty Shop brand book — "Yu•R", not
// "Yu.R" or "Asian Beauty Shop". Matches the typography Max requested for the
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
 * under every line tab — an admin ticks all 3 boxes in admin and the rest
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
 * Expand a parent-category slug into its full descendant slug list so a
 * `?category=cleansers` filter matches products tagged on any of its
 * subcategories (Oil Cleansers, Cleansing Balms, …) — products are
 * usually tagged on the leaf, not the parent, so without this the
 * parent landing page would show zero results.
 *
 * Returns at minimum [slug] (so leaf categories or unknown slugs still
 * work). Single DB call per category — we recurse in TypeScript, not
 * via Prisma's recursive CTE (the tree is shallow, two levels max).
 *
 * Memoisation is not needed: buildShopWhere is called once per request
 * per filter combination, and the categories table is < 50 rows.
 */
async function expandCategorySlug(slug: string): Promise<string[]> {
  // Fetch the row + its direct children. Two-level tree means "children
  // of the root" is enough — but we still walk recursively to stay
  // future-proof if the tree ever deepens.
  const cat = await prisma.category.findUnique({
    where: { slug },
    select: {
      slug: true,
      children: { select: { slug: true, children: { select: { slug: true } } } },
    },
  });
  if (!cat) return [slug];

  const all = new Set<string>([cat.slug]);
  for (const c of cat.children) {
    all.add(c.slug);
    for (const gc of c.children) all.add(gc.slug);
  }
  return Array.from(all);
}

/**
 * Build the Prisma where clause shared by getShopProducts + the facet
 * counters in getShopFilters. Kept as its own function so we can't drift
 * between "what the grid shows" and "what the sidebar counts".
 *
 * Async because category filters tree-walk via expandCategorySlug to
 * include products on descendant subcategories. All other filters are
 * still synchronous.
 */
async function buildShopWhere(
  filters: ShopFilterArgs,
): Promise<Prisma.ProductWhereInput> {
  const AND: Prisma.ProductWhereInput[] = [
    { status: ProductStatus.PUBLISHED },
    { deletedAt: null },
  ];

  if (filters.categorySlug) {
    // Walk the tree: a parent slug expands to itself + every descendant
    // so the filter catches products tagged on any sub. Leaf slugs and
    // unknown slugs return [slug] from expand, so the IN list still
    // works as strict-match.
    const slugList = await expandCategorySlug(filters.categorySlug);
    AND.push({
      categories: { some: { category: { slug: { in: slugList } } } },
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
  // Locked filters used by /sale and /new dedicated pages.
  if (filters.onSaleOnly) {
    AND.push({ isOnSale: true });
  }
  if (filters.isNewOnly) {
    AND.push({ isNew: true });
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

  const where = await buildShopWhere(filters);

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
        // Variants — only the fields cardCartFlags needs. Pulling all
        // variants is cheap; the join is keyed and bounded by product
        // and most products have ≤ 5 variants.
        variants: {
          select: { stock: true },
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
      ...applyCardSale(p),
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
      ...cardCartFlags(p),
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
  // they only confuse. Without a line filter we keep zeros (an admin may be
  // staging a new shelf and wants the chip to render as "MORE" candidate).
  if (lineSlugs && lineSlugs.length > 0) {
    return mapped.filter((c) => c.count > 0);
  }
  return mapped;
}

/**
 * getShopCategoryTree — feeds the new hierarchical category strip on
 * /shop. Returns the parent → children tree with counts SCOPED to the
 * currently-active brand filter (so picking YU•R Pro narrows the row
 * to "Cleansers (3) / Toners (2) / …" instead of catalogue totals).
 *
 * Differs from getShopMegaMenuData (which is unfiltered, used by the
 * site nav) in two ways:
 *   1. Counts respect brandSlugs.
 *   2. We DON'T hide parents whose direct count is zero — the
 *      parent's full descendant count is what matters for whether
 *      the row is interactive. A parent with empty subs is still
 *      hidden because clicking it leads to nothing.
 */
export type ShopCategoryTreeNode = {
  slug: string;
  name: string;
  count: number;
  children: Array<{ slug: string; name: string; count: number }>;
};

export async function getShopCategoryTree(
  locale: string,
  { brandSlugs }: { brandSlugs?: string[] } = {},
): Promise<ShopCategoryTreeNode[]> {
  const loc = toPrismaLocale(locale);

  // Product where used inside _count subqueries — applies the brand
  // filter when set so each category's count reflects "products in
  // this category AND in the selected brand".
  const productScope: Prisma.ProductWhereInput = {
    status: ProductStatus.PUBLISHED,
    deletedAt: null,
    ...(brandSlugs && brandSlugs.length > 0
      ? { brand: { slug: { in: brandSlugs } } }
      : {}),
  };

  const cats = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      parentId: true,
      translations: {
        where: { locale: { in: [loc, Locale.EN] } },
        select: { locale: true, name: true },
      },
      _count: {
        select: {
          products: { where: { product: productScope } },
        },
      },
    },
  });

  const labelOf = (c: (typeof cats)[number]) =>
    c.translations.find((t) => t.locale === loc)?.name ??
    c.translations.find((t) => t.locale === Locale.EN)?.name ??
    c.slug;

  const parents = cats.filter((c) => c.parentId === null);
  const childrenOf = (parentId: string) =>
    cats.filter((c) => c.parentId === parentId);

  const tree = parents
    .map((p) => {
      const kids = childrenOf(p.id)
        .filter((c) => c._count.products > 0)
        .map((c) => ({
          slug: c.slug,
          name: labelOf(c),
          count: c._count.products,
        }));
      const totalCount =
        p._count.products + kids.reduce((sum, k) => sum + k.count, 0);
      return {
        slug: p.slug,
        name: labelOf(p),
        count: totalCount,
        children: kids,
      };
    })
    .filter((p) => p.count > 0);

  return tree;
}

/**
 * getShopMegaMenuData — feeds the Nav's Shop mega-menu (desktop hover
 * panel + mobile drawer accordion).
 *
 * Returns:
 *   · `tree`: top-level categories (parentId=null) sorted by sortOrder,
 *     each with the list of its children that have ≥1 published
 *     product. Empty children are dropped. Parent rows include a count
 *     that walks the tree (parent products + all descendants), so the
 *     menu can show "Cleansers (24)" instead of just the products tagged
 *     directly to the parent.
 *
 *   · `brands`: every active brand sorted by name, each with the count
 *     of published products attached. Brands with zero products are
 *     dropped — no point linking to a dead landing page.
 *
 * Performance: one categories query + one brands query, both with their
 * count subqueries. Called once per request from the layout, so it's
 * fine to fetch the full tree even though the menu only renders it on
 * hover/tap.
 */
export type ShopMegaMenuData = {
  tree: Array<{
    slug: string;
    name: string;
    count: number;
    children: Array<{ slug: string; name: string; count: number }>;
  }>;
  brands: Array<{ slug: string; name: string; count: number }>;
};

export async function getShopMegaMenuData(
  locale: string,
): Promise<ShopMegaMenuData> {
  const loc = toPrismaLocale(locale);

  // Pull every active category + its EN/locale translations + the
  // direct-product count. We'll fold parents and children together
  // client-side to keep the query simple.
  const cats = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      parentId: true,
      sortOrder: true,
      translations: {
        where: { locale: { in: [loc, Locale.EN] } },
        select: { locale: true, name: true },
      },
      _count: {
        select: {
          products: {
            where: {
              product: {
                status: ProductStatus.PUBLISHED,
                deletedAt: null,
              },
            },
          },
        },
      },
    },
  });

  const labelOf = (c: (typeof cats)[number]) =>
    c.translations.find((t) => t.locale === loc)?.name ??
    c.translations.find((t) => t.locale === Locale.EN)?.name ??
    c.slug;

  const parents = cats.filter((c) => c.parentId === null);
  const childrenOf = (parentId: string) =>
    cats.filter((c) => c.parentId === parentId);

  const tree = parents.map((p) => {
    const kids = childrenOf(p.id)
      // Hide empty subcategories — the user spec said empty subs should
      // never show in the nav. The parent itself stays visible even if
      // direct-product count is zero, as long as ANY descendant has
      // products.
      .filter((c) => c._count.products > 0)
      .map((c) => ({
        slug: c.slug,
        name: labelOf(c),
        count: c._count.products,
      }));

    // Walk-the-tree count: parent's direct products + all surviving
    // children's products. This is the headline number a customer
    // reads beside the parent name.
    const totalCount =
      p._count.products + kids.reduce((sum, k) => sum + k.count, 0);

    return {
      slug: p.slug,
      name: labelOf(p),
      count: totalCount,
      children: kids,
    };
  })
    // Drop parents that ended up with zero everywhere — they have no
    // products and no published children, so a link to them is dead.
    .filter((p) => p.count > 0);

  // Brands — flat list, ordered by name. Includes count so the menu can
  // show "AHC (12)" beside each brand. Inactive brands and brands with
  // no published products don't render.
  const brands = await prisma.brand.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      slug: true,
      name: true,
      _count: {
        select: {
          products: {
            where: {
              status: ProductStatus.PUBLISHED,
              deletedAt: null,
            },
          },
        },
      },
    },
  });

  return {
    tree,
    brands: brands
      .map((b) => ({ slug: b.slug, name: b.name, count: b._count.products }))
      .filter((b) => b.count > 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// /brands index page query — fatter than the mega-menu brand list because
// each card on the index renders the brand's logo + a tagline (when set).
// Mega-menu skips both for performance.
// ─────────────────────────────────────────────────────────────────────────

export type BrandIndexCard = {
  slug: string;
  name: string;
  logoUrl: string | null;
  tagline: string | null;
  productCount: number;
  /** Whether the brand has its own about content (cover OR story OR tagline)
   *  — when false the tile suppresses the "About" link affordance. We don't
   *  resolve aboutFromBrandId here for performance; the about page itself
   *  handles the inheritance. Tiles whose brand inherits get the link too. */
  hasAbout: boolean;
};

export async function getBrandsForIndexPage(
  locale: string,
): Promise<BrandIndexCard[]> {
  const loc = toPrismaLocale(locale);

  const rows = await prisma.brand.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      slug: true,
      name: true,
      logoUrl: true,
      coverImageUrl: true,
      aboutFromBrandId: true,
      translations: {
        where: { locale: { in: [loc, Locale.EN] } },
        select: { locale: true, tagline: true, story: true },
      },
      _count: {
        select: {
          products: {
            where: {
              status: ProductStatus.PUBLISHED,
              deletedAt: null,
            },
          },
        },
      },
    },
  });

  return rows
    .map((b) => {
      // Locale-first, EN fallback for the tagline.
      const localeTr = b.translations.find((t) => t.locale === loc);
      const enTr = b.translations.find((t) => t.locale === Locale.EN);
      const tagline = localeTr?.tagline ?? enTr?.tagline ?? null;
      // "Has about" is true when EITHER:
      //   - the brand has its own cover/tagline/story locally, OR
      //   - it inherits from another brand (aboutFromBrandId set).
      // The about page handles whether the inherited brand actually has
      // content — tiles just need a yes/no for the link.
      const hasOwnContent =
        b.coverImageUrl !== null ||
        localeTr?.story != null ||
        enTr?.story != null ||
        tagline != null;
      const hasAbout = hasOwnContent || b.aboutFromBrandId !== null;
      return {
        slug: b.slug,
        name: b.name,
        logoUrl: b.logoUrl,
        tagline,
        productCount: b._count.products,
        hasAbout,
      };
    })
    // Drop dead brands — same rule as the mega-menu list.
    .filter((b) => b.productCount > 0);
}

// ─────────────────────────────────────────────────────────────────────────
// /brands/[slug]/about query — resolves the aboutFromBrandId chain so that
// sub-brands inherit their canonical parent's content. Returns the SOURCE
// brand's tagline + story + cover image, while keeping the requested
// brand's name as the page heading. One DB roundtrip via include.
// ─────────────────────────────────────────────────────────────────────────

/** Single certification row authored by the admin. Codes are usually
 *  short universal acronyms (CPNP, ECAS, GMP); descriptions explain
 *  the code in human language. */
export type BrandCertification = {
  code: string;
  description: string;
};

export type ShopBrandAbout = {
  /** The slug used to reach this page (preserved even when content is inherited). */
  slug: string;
  /** Display name shown in the H1. Always the requested brand's own name. */
  name: string;
  /** Cover image URL — resolved from aboutFromBrand if set, else self. */
  coverImageUrl: string | null;
  /** CSS `object-position` value for the cover crop. Resolved from the
   *  same source as coverImageUrl so the position stays paired with
   *  its photo (you don't get the parent's photo with the child's
   *  position). */
  coverPosition: string;
  /** Tagline — locale-first w/ EN fallback, resolved from inherited brand. */
  tagline: string | null;
  /** Story HTML — same resolution as tagline. */
  story: string | null;
  /** Certifications — empty when none authored. Resolved from the source
   *  brand (inherited if applicable). */
  certifications: BrandCertification[];
  /** Safety/usage note rendered as a callout box on the page. Same
   *  inheritance rules as certifications. */
  safetyNote: string | null;
  /** When true, this brand inherits from another (used to show a small
   *  "About {parentName}" subhead on the page). */
  inheritedFromName: string | null;
};

/** Cover position is stored as `"X% Y%"` where X and Y are 0-100. The
 *  admin focal-point picker writes percentages directly, which gives
 *  pixel-accurate control vs. the original 9-keyword grid. Any value
 *  that doesn't match the expected format (legacy keyword values,
 *  hand-edited DB rows, garbage) falls back to centred so the renderer
 *  never receives arbitrary CSS. */
const COVER_POSITION_PCT_RE = /^\d{1,3}% \d{1,3}%$/;

function resolveCoverPosition(raw: string | null | undefined): string {
  if (!raw) return "50% 50%";
  if (!COVER_POSITION_PCT_RE.test(raw)) return "50% 50%";
  // Defensive bounds-check: regex allows up to 999%, clamp to 100.
  const [x, y] = raw.split(" ").map((s) => Number.parseInt(s, 10));
  if (x > 100 || y > 100) return "50% 50%";
  return raw;
}

/** Defensive parser for the certifications JSONB column — admins can
 *  paste odd values, the migration is permissive, so we filter out
 *  malformed rows rather than render `[object Object]` to customers. */
function parseCertifications(raw: unknown): BrandCertification[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const code = typeof r.code === "string" ? r.code.trim() : "";
    const description =
      typeof r.description === "string" ? r.description.trim() : "";
    if (!code && !description) return [];
    return [{ code, description }];
  });
}

export async function getBrandAboutBySlug(
  locale: string,
  slug: string,
): Promise<ShopBrandAbout | null> {
  const loc = toPrismaLocale(locale);

  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      coverImageUrl: true,
      coverPosition: true,
      aboutFromBrandId: true,
      // Certifications are GLOBAL (Brand-level) — codes like CPNP /
      // ECAS / GMP are regulatory acronyms that don't translate, so
      // there's no NL/FR/RU variant to maintain. Safety note IS
      // per-locale on BrandTranslation so DeepL can fill it.
      certifications: true,
      translations: {
        where: { locale: { in: [loc, Locale.EN] } },
        select: {
          locale: true,
          tagline: true,
          story: true,
          safetyNote: true,
        },
      },
      // Pull the parent's content in the same query so we don't fan out a
      // second roundtrip when sub-brands resolve to a parent. Null when
      // aboutFromBrandId is unset.
      aboutFromBrand: {
        select: {
          name: true,
          coverImageUrl: true,
          coverPosition: true,
          certifications: true,
          translations: {
            where: { locale: { in: [loc, Locale.EN] } },
            select: {
              locale: true,
              tagline: true,
              story: true,
              safetyNote: true,
            },
          },
        },
      },
    },
  });

  if (!brand || !brand.isActive) return null;

  // Pick the SOURCE for content — parent if set, otherwise self. The page
  // heading still uses the REQUESTED brand's name (so visiting /brands/yur-pro
  // still says "Yu.R Pro" at the top, just with Yu.R's story below).
  const source = brand.aboutFromBrand ?? brand;
  const localeTr = source.translations.find((t) => t.locale === loc);
  const enTr = source.translations.find((t) => t.locale === Locale.EN);

  // Certifications are global on the source brand. Safety note still
  // resolves locale-first with EN fallback (it's prose, gets DeepL'd).
  const certifications = parseCertifications(source.certifications);

  return {
    slug: brand.slug,
    name: brand.name,
    coverImageUrl: source.coverImageUrl,
    coverPosition: resolveCoverPosition(source.coverPosition),
    tagline: localeTr?.tagline ?? enTr?.tagline ?? null,
    story: localeTr?.story ?? enTr?.story ?? null,
    certifications,
    safetyNote: localeTr?.safetyNote ?? enTr?.safetyNote ?? null,
    inheritedFromName: brand.aboutFromBrand?.name ?? null,
  };
}

/** Lightweight list for the admin's "Source about content from" picker.
 *  Returns every active brand except the one being edited (a brand can't
 *  inherit from itself). Keep cheap — name + slug only. */
export async function getBrandsForAboutPicker(
  excludeBrandId: string,
): Promise<Array<{ id: string; name: string; slug: string }>> {
  return prisma.brand.findMany({
    where: { id: { not: excludeBrandId }, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

/**
 * Given a brand slug, return the slugs of every brand in its "About
 * family" — used by the brand About page CTA to deep-link back to /shop
 * with a pre-applied multi-brand filter. The family is:
 *
 *   · the canonical brand (self if standalone, else aboutFromBrand parent)
 *   · every other brand inheriting from that canonical (siblings + self)
 *
 * Example: for Yu.R Me (which inherits from Yu.R), the family is
 * { Yu.R, Yu.R Pro, Yu.R Me }. For a standalone brand it's just itself.
 *
 * Inactive brands are excluded so the CTA never points at hidden inventory.
 */
export async function getBrandFamilySlugs(slug: string): Promise<string[]> {
  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: { id: true, isActive: true, aboutFromBrandId: true },
  });
  if (!brand || !brand.isActive) return [];

  const canonicalId = brand.aboutFromBrandId ?? brand.id;

  const family = await prisma.brand.findMany({
    where: {
      isActive: true,
      OR: [{ id: canonicalId }, { aboutFromBrandId: canonicalId }],
    },
    select: { slug: true },
    orderBy: { name: "asc" },
  });
  return family.map((b) => b.slug);
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
   * Always emitted in PRODUCT_LINES order, never alphabetised — an admin
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
 * Ingredients are optionally capped to the most-used ones because an admin
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
  /** Effective per-unit price (already includes Product.salePercent). */
  priceEur: number;
  comparePriceEur: number | null;
  /** Sale display fields — see ProductCardData for the same shape. */
  isOnSale: boolean;
  originalPriceEur: number | null;
  discountPercent: number | null;
  volumeMl: number | null;
  /** Net weight in grams. Same role as volumeMl but for solid products
   *  (powders, balms, etc.). Both fields can be set; the PDP picks
   *  volumeMl first, falls back to weightGrams. */
  weightGrams: number | null;
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
   * admin "Preview as customer" flow so an admin can QA a product page before
   * flipping it to PUBLISHED. The caller MUST gate this behind an admin
   * auth check — never pass `true` based on an untrusted query param alone.
   * Soft-deleted products (`deletedAt`) remain hidden in either mode.
   */
  allowUnpublished?: boolean;
}): Promise<ProductDetail | null> {
  const loc = toPrismaLocale(locale);

  // Lookup strategy:
  //   1. Strict match on (URL locale, slug) — the happy path.
  //   2. If that returns null, fall back to the EN translation with the
  //      same slug. This catches the case where an admin hasn't translated a
  //      product into the visitor's chosen locale yet — the LocaleSwitcher
  //      sends them to /ru/shop/<EN slug> rather than 404'ing, and we
  //      surface the EN copy with localized chrome (nav, footer) around it.
  //
  // We INCLUDE every translation row on the product so we can pick the
  // best-fit one for rendering after the lookup succeeds. Wrapped in a
  // factory so each call gets a fresh mutable object — Prisma's types
  // reject `as const`-frozen includes.
  const buildProductInclude = () => ({
    brand: { include: { translations: { where: { locale: loc } } } },
    translations: true, // every locale (for switcher + fallback rendering)
    media: {
      where: { kind: "IMAGE" as const },
      orderBy: [
        { isPrimary: "desc" as const },
        { sortOrder: "asc" as const },
      ],
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
  });

  let tr = await prisma.productTranslation.findFirst({
    where: { locale: loc, slug },
    include: { product: { include: buildProductInclude() } },
  });

  // Fallback: same slug but EN locale. Catches /ru/shop/<en-slug> when
  // the product has no RU translation yet.
  if (!tr && loc !== Locale.EN) {
    tr = await prisma.productTranslation.findFirst({
      where: { locale: Locale.EN, slug },
      include: { product: { include: buildProductInclude() } },
    });
  }

  if (!tr || tr.product.deletedAt) {
    return null;
  }
  if (!allowUnpublished && tr.product.status !== ProductStatus.PUBLISHED) {
    return null;
  }

  const p = tr.product;

  // Pick the translation we actually want to render: prefer URL locale,
  // then EN, then whatever the lookup matched as a last resort. Note
  // that field-level fallback (e.g. RU translation that has only `name`
  // filled) isn't handled — translations are upserted as a unit.
  const renderTr =
    p.translations.find((t) => t.locale === loc) ??
    p.translations.find((t) => t.locale === Locale.EN) ??
    tr;

  // Build a { EN: "rice-water-cleanser", NL: "rijstwater-reiniger", … } map
  // so the language switcher can preserve context across languages. For
  // locales without their own slug we fall back to the EN slug — the page
  // load on the other side then triggers the EN-fallback lookup above.
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
    ...applyCardSale(p),
    comparePriceEur: p.comparePrice ? Number(p.comparePrice) : null,
    volumeMl: p.volumeMl,
    weightGrams: p.weightGrams,
    isFeatured: p.isFeatured,
    isBestseller: p.isBestseller,
    brand: p.brand
      ? { name: p.brand.name, slug: p.brand.slug, country: p.brand.country }
      : null,
    name: renderTr.name,
    slug: renderTr.slug,
    tagline: renderTr.shortDescription,
    descriptionHtml: renderTr.description,
    howToUseHtml: renderTr.howToUse,
    warningsText: renderTr.warnings,
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
          variants: { select: { stock: true } },
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
        variants: { select: { stock: true } },
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
      ...applyCardSale(p),
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
      ...cardCartFlags(p),
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
    ((await buildShopWhere(filters)).AND as Prisma.ProductWhereInput[]) ?? [];

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
        variants: { select: { stock: true } },
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
      ...applyCardSale(p),
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
      ...cardCartFlags(p),
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
 * the category row's, so Google sees a fresh stamp when an admin edits
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
 * per (slug, locale) pair. Only active brands are emitted — an admin may
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
