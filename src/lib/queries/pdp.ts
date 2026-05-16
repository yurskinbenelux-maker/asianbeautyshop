// ─────────────────────────────────────────────────────────────────────────
// PDP extras — everything the product detail page needs beyond the base
// ProductDetail shape returned by getProductBySlug().
//
// Split out of products.ts to keep that file readable. Each helper is a
// pure function you call with the productId + locale; translations are
// resolved with EN fallback to match the rest of the shop.
// ─────────────────────────────────────────────────────────────────────────

import { Locale, TimeOfDay } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toPrismaLocale } from "./products";

// ─── variants ──────────────────────────────────────────────────────────

/** Shape consumed by the variant selector on the PDP. */
export type PdpVariant = {
  id: string;
  sku: string;
  label: string;
  /** Effective price in EUR — variant override if set, else base product price. */
  priceEur: number;
  comparePriceEur: number | null;
  stock: number;
  isDefault: boolean;
  isInStock: boolean;
  sortOrder: number;
  /** Phase 2 per-variant volume override (in ml). Null = inherit
   *  Product.volumeMl. The PDP component groups variants by this
   *  value: when more than one DISTINCT non-null volume exists
   *  across the variant set, it renders a second selector row. */
  volumeMl: number | null;
};

export async function getProductVariants({
  productId,
  basePriceEur,
  baseComparePriceEur,
}: {
  productId: string;
  basePriceEur: number;
  baseComparePriceEur: number | null;
}): Promise<PdpVariant[]> {
  const rows = await prisma.productVariant.findMany({
    where: { productId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return rows.map((v) => {
    // A null override means "inherit the base product price".
    const price = v.price ? Number(v.price) : basePriceEur;
    const compare = v.comparePrice
      ? Number(v.comparePrice)
      : baseComparePriceEur;
    return {
      id: v.id,
      sku: v.sku,
      label: v.label,
      priceEur: price,
      comparePriceEur: compare,
      stock: v.stock,
      isDefault: v.isDefault,
      isInStock: v.stock > 0,
      sortOrder: v.sortOrder,
      volumeMl: v.volumeMl,
    };
  });
}

// ─── ingredients ───────────────────────────────────────────────────────

export type PdpIngredient = {
  id: string;
  slug: string;
  inciName: string;
  displayName: string;          // locale-resolved (or INCI as fallback)
  description: string | null;   // rich HTML from IngredientTranslation
  isKey: boolean;               // pinned from the join row (this product)
  isKeyAsset: boolean;          // global flag on Ingredient itself
  isAllergen: boolean;
  percentage: number | null;    // if admin recorded the concentration
};

export async function getProductIngredients({
  productId,
  locale,
}: {
  productId: string;
  locale: string;
}): Promise<PdpIngredient[]> {
  const loc = toPrismaLocale(locale);

  // We order by isKey first so the key assets surface at the top when
  // admin hasn't bothered to sort the list. The join table itself has
  // no sortOrder column (design choice — keep it simple), so we rely
  // on isKey + inciName alphabetical as the deterministic tie-breaker.
  const rows = await prisma.productIngredient.findMany({
    where: { productId },
    include: {
      ingredient: {
        include: {
          translations: { where: { locale: { in: [loc, Locale.EN] } } },
        },
      },
    },
  });

  const mapped = rows.map((r) => {
    const tr =
      r.ingredient.translations.find((t) => t.locale === loc) ??
      r.ingredient.translations.find((t) => t.locale === Locale.EN);
    return {
      id: r.ingredient.id,
      slug: r.ingredient.slug,
      inciName: r.ingredient.inciName,
      displayName: tr?.displayName ?? r.ingredient.inciName,
      description: tr?.description ?? null,
      isKey: r.isKey,
      isKeyAsset: r.ingredient.isKeyAsset,
      isAllergen: r.ingredient.isAllergen,
      percentage: r.percentage,
    };
  });

  // Sort: product-level isKey → global isKeyAsset → alphabetical by INCI.
  mapped.sort((a, b) => {
    if (a.isKey !== b.isKey) return a.isKey ? -1 : 1;
    if (a.isKeyAsset !== b.isKeyAsset) return a.isKeyAsset ? -1 : 1;
    return a.inciName.localeCompare(b.inciName);
  });

  return mapped;
}

// ─── benefits ──────────────────────────────────────────────────────────

export type PdpBenefit = {
  id: string;
  slug: string;
  icon: string | null;
  label: string;
};

export async function getProductBenefits({
  productId,
  locale,
}: {
  productId: string;
  locale: string;
}): Promise<PdpBenefit[]> {
  const loc = toPrismaLocale(locale);

  const rows = await prisma.productBenefit.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    include: {
      benefit: {
        include: {
          translations: { where: { locale: { in: [loc, Locale.EN] } } },
        },
      },
    },
  });

  return rows.map((r) => {
    const tr =
      r.benefit.translations.find((t) => t.locale === loc) ??
      r.benefit.translations.find((t) => t.locale === Locale.EN);
    return {
      id: r.benefit.id,
      slug: r.benefit.slug,
      icon: r.benefit.icon,
      label: tr?.label ?? r.benefit.slug,
    };
  });
}

// ─── skin types / concerns ─────────────────────────────────────────────

export type PdpTag = {
  slug: string;
  label: string;
};

export async function getProductSkinTypes({
  productId,
  locale,
}: {
  productId: string;
  locale: string;
}): Promise<PdpTag[]> {
  const loc = toPrismaLocale(locale);

  const rows = await prisma.productSkinType.findMany({
    where: { productId },
    include: {
      skinType: {
        include: {
          translations: { where: { locale: { in: [loc, Locale.EN] } } },
        },
      },
    },
  });

  return rows.map((r) => {
    const tr =
      r.skinType.translations.find((t) => t.locale === loc) ??
      r.skinType.translations.find((t) => t.locale === Locale.EN);
    return { slug: r.skinType.slug, label: tr?.label ?? r.skinType.slug };
  });
}

export async function getProductConcerns({
  productId,
  locale,
}: {
  productId: string;
  locale: string;
}): Promise<PdpTag[]> {
  const loc = toPrismaLocale(locale);

  const rows = await prisma.productConcern.findMany({
    where: { productId },
    include: {
      concern: {
        include: {
          translations: { where: { locale: { in: [loc, Locale.EN] } } },
        },
      },
    },
  });

  return rows.map((r) => {
    const tr =
      r.concern.translations.find((t) => t.locale === loc) ??
      r.concern.translations.find((t) => t.locale === Locale.EN);
    return { slug: r.concern.slug, label: tr?.label ?? r.concern.slug };
  });
}

// ─── ritual steps (01 / 02 / 03 cards) ─────────────────────────────────

export type PdpRitualStep = {
  id: string;
  stepNumber: number;
  timeOfDay: TimeOfDay;
  title: string;
  bodyHtml: string;
};

export async function getProductRitualSteps({
  productId,
  locale,
}: {
  productId: string;
  locale: string;
}): Promise<PdpRitualStep[]> {
  const loc = toPrismaLocale(locale);

  const rows = await prisma.ritualStep.findMany({
    where: { productId },
    orderBy: { stepNumber: "asc" },
    include: {
      translations: { where: { locale: { in: [loc, Locale.EN] } } },
    },
  });

  return rows
    .map((s) => {
      const tr =
        s.translations.find((t) => t.locale === loc) ??
        s.translations.find((t) => t.locale === Locale.EN);
      // A step with no translation at all is skipped — no point rendering
      // a numbered card with no copy.
      if (!tr) return null;
      return {
        id: s.id,
        stepNumber: s.stepNumber,
        timeOfDay: s.timeOfDay,
        title: tr.title,
        bodyHtml: tr.body,
      };
    })
    .filter((s): s is PdpRitualStep => s !== null);
}

// ─── ritual bundles ("complete your ritual") ───────────────────────────

export type PdpBundleItem = {
  id: string;
  sku: string;
  priceEur: number;
  comparePriceEur: number | null;
  name: string;
  slug: string;
  tagline: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
};

/**
 * Fetch products linked with reason="bundle" or "ritual" in ProductRelated.
 * These are the products an admin curated as "buy this together" pairings —
 * distinct from the `related` list, which is looser ("wear with").
 *
 * If no bundle relations exist, returns an empty array — the section on
 * the page will self-hide rather than falling back to something generic,
 * because a bad bundle suggestion hurts trust.
 */
export async function getProductBundle({
  productId,
  locale,
  limit = 3,
}: {
  productId: string;
  locale: string;
  limit?: number;
}): Promise<PdpBundleItem[]> {
  const loc = toPrismaLocale(locale);

  // We match on reason containing "bundle" OR "ritual" (case-insensitive)
  // so admin can name it either way and we still pick it up. This is a
  // very cheap filter — ProductRelated isn't large.
  const rows = await prisma.productRelated.findMany({
    where: {
      fromId: productId,
      OR: [
        { reason: { contains: "bundle", mode: "insensitive" } },
        { reason: { contains: "ritual", mode: "insensitive" } },
      ],
    },
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

  return rows
    .filter((r) => r.to.status === "PUBLISHED" && !r.to.deletedAt)
    .map((r) => {
      const p = r.to;
      const tr =
        p.translations.find((t) => t.locale === loc) ??
        p.translations.find((t) => t.locale === Locale.EN);
      const img = p.media[0] ?? null;
      return {
        id: p.id,
        sku: p.sku,
        priceEur: Number(p.price),
        comparePriceEur: p.comparePrice ? Number(p.comparePrice) : null,
        name: tr?.name ?? p.sku,
        slug: tr?.slug ?? p.sku.toLowerCase(),
        tagline: tr?.shortDescription ?? null,
        imageUrl: img?.url ?? null,
        imageAlt: img?.alt ?? tr?.name ?? null,
      };
    });
}

// ─── reviews ───────────────────────────────────────────────────────────

export type PdpReviewSummary = {
  count: number;
  average: number | null;          // null when count = 0
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type PdpReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  isVerified: boolean;
  authorName: string;              // "First L." or "Guest"
  locale: Locale;
  createdAt: Date;
};

export async function getProductReviewSummary({
  productId,
}: {
  productId: string;
}): Promise<PdpReviewSummary> {
  // Only published reviews count toward the public rating.
  const grouped = await prisma.review.groupBy({
    by: ["rating"],
    where: { productId, isPublished: true },
    _count: { _all: true },
  });

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  let total = 0;
  let sum = 0;
  for (const row of grouped) {
    const r = row.rating as 1 | 2 | 3 | 4 | 5;
    const n = row._count?._all ?? 0;
    if (r >= 1 && r <= 5) {
      distribution[r] = n;
      total += n;
      sum += r * n;
    }
  }

  return {
    count: total,
    average: total === 0 ? null : Math.round((sum / total) * 10) / 10,
    distribution,
  };
}

export async function getProductReviews({
  productId,
  limit = 8,
}: {
  productId: string;
  /** @deprecated kept in the signature for callsite compatibility but no
   *  longer filters — an admin explicitly asked for all reviews to show
   *  regardless of which locale the visitor is browsing. A French
   *  shopper sees the Dutch reviews too. */
  locale?: string;
  limit?: number;
}): Promise<PdpReview[]> {
  // Simple flat query — no locale split. Verified reviews float to the
  // top so trust signals win, then newest-first.
  const rows = await prisma.review.findMany({
    where: { productId, isPublished: true },
    orderBy: [{ isVerified: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      user: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  return rows.map((r) => {
    // Author display priority:
    //   1. authorName column (set by guest reviews + new verified writes)
    //   2. User.firstName + LastInitial (legacy verified reviews)
    //   3. "Guest" fallback
    const first = r.user?.firstName?.trim() ?? "";
    const last = r.user?.lastName?.trim() ?? "";
    const stored = r.authorName?.trim() ?? "";
    let authorName = "Guest";
    if (stored) authorName = stored;
    else if (first && last) authorName = `${first} ${last[0]}.`;
    else if (first) authorName = first;
    else if (last) authorName = last;

    return {
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      isVerified: r.isVerified,
      authorName,
      locale: r.locale,
      createdAt: r.createdAt,
    };
  });
}
