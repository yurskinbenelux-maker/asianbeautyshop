// ─────────────────────────────────────────────────────────────────────────
// AI catalog helpers
//
// Shared between the rule-based skin quiz (Layer 1) and the Groq tool
// calls (Layer 2). The goal is to keep every DB read for the concierge
// in one place, so we can reason about:
//
//   · What products the AI is allowed to recommend  (isAvailableForAi)
//   · What status/visibility filters are enforced   (PUBLISHED only)
//   · How taxonomy fallbacks behave when a slug doesn't exist yet
//
// None of these functions accept free-form SQL-ish input from the LLM;
// they only take explicit filter args, so tool-calling can't exfiltrate
// or mutate data outside the product catalog.
// ─────────────────────────────────────────────────────────────────────────

import { Locale, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toPrismaLocale } from "@/lib/queries/products";

/** Compact product summary sent to the LLM (and used by quiz routines). */
export type AiProductSummary = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  tagline: string | null;
  priceEur: number;
  comparePriceEur: number | null;
  imageUrl: string | null;
  categorySlugs: string[];
  skinTypeSlugs: string[];
  concernSlugs: string[];
  benefitSlugs: string[];
};

/** Build a locale-resolved summary from a full Product row. */
function summarise(
  p: Awaited<ReturnType<typeof prisma.product.findMany>>[number] & {
    translations: { locale: Locale; name: string; slug: string; shortDescription: string | null }[];
    media: { url: string }[];
    categories: { category: { slug: string } }[];
    skinTypes: { skinType: { slug: string } }[];
    concerns: { concern: { slug: string } }[];
    benefits: { benefit: { slug: string } }[];
  },
  loc: Locale,
): AiProductSummary {
  const tr =
    p.translations.find((t) => t.locale === loc) ??
    p.translations.find((t) => t.locale === Locale.EN) ??
    p.translations[0];

  return {
    id: p.id,
    sku: p.sku,
    slug: tr?.slug ?? p.sku.toLowerCase(),
    name: tr?.name ?? p.sku,
    tagline: tr?.shortDescription ?? null,
    priceEur: Number(p.price),
    comparePriceEur: p.comparePrice ? Number(p.comparePrice) : null,
    imageUrl: p.media[0]?.url ?? null,
    categorySlugs: p.categories.map((c) => c.category.slug),
    skinTypeSlugs: p.skinTypes.map((s) => s.skinType.slug),
    concernSlugs: p.concerns.map((c) => c.concern.slug),
    benefitSlugs: p.benefits.map((b) => b.benefit.slug),
  };
}

const AI_INCLUDE = {
  translations: { select: { locale: true, name: true, slug: true, shortDescription: true } },
  media: {
    where: { kind: "IMAGE" as const },
    orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }],
    take: 1,
    select: { url: true },
  },
  categories: { select: { category: { select: { slug: true } } } },
  skinTypes: { select: { skinType: { select: { slug: true } } } },
  concerns: { select: { concern: { select: { slug: true } } } },
  benefits: { select: { benefit: { select: { slug: true } } } },
};

const AI_WHERE_BASE = {
  status: ProductStatus.PUBLISHED,
  deletedAt: null,
  isAvailableForAi: true,
  hideFromSearch: false,
};

// ──────── searchCatalog ─────────────────────────────────────────────────

export type CatalogSearchArgs = {
  locale: string;
  query?: string;                  // free-text match on name/tagline
  skinTypeSlugs?: string[];
  concernSlugs?: string[];
  categorySlugs?: string[];
  maxPriceEur?: number;
  limit?: number;                  // default 6, max 12
};

/**
 * searchCatalog — the one tool the AI uses to find products.
 *
 * Slug arrays are ORed internally ("dry OR sensitive"), ANDed across
 * axes (skin type AND concern). Unknown slugs are ignored rather than
 * erroring out — keeps the LLM from looping on a typo.
 */
export async function searchCatalog(
  args: CatalogSearchArgs,
): Promise<AiProductSummary[]> {
  const loc = toPrismaLocale(args.locale);
  const limit = Math.min(Math.max(args.limit ?? 6, 1), 12);

  const q = args.query?.trim();

  const rows = await prisma.product.findMany({
    where: {
      ...AI_WHERE_BASE,
      ...(q && {
        translations: {
          some: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { shortDescription: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      }),
      ...(args.skinTypeSlugs?.length && {
        skinTypes: {
          some: { skinType: { slug: { in: args.skinTypeSlugs } } },
        },
      }),
      ...(args.concernSlugs?.length && {
        concerns: {
          some: { concern: { slug: { in: args.concernSlugs } } },
        },
      }),
      ...(args.categorySlugs?.length && {
        categories: {
          some: { category: { slug: { in: args.categorySlugs } } },
        },
      }),
      ...(args.maxPriceEur && { price: { lte: args.maxPriceEur } }),
    },
    orderBy: [
      { isBestseller: "desc" },
      { isFeatured: "desc" },
      { launchedAt: "desc" },
    ],
    take: limit,
    include: AI_INCLUDE,
  });

  return rows.map((r) => summarise(r, loc));
}

// ──────── getProductBySku ──────────────────────────────────────────────

export async function getProductBySku(
  sku: string,
  locale: string,
): Promise<AiProductSummary | null> {
  const loc = toPrismaLocale(locale);
  const row = await prisma.product.findFirst({
    where: { ...AI_WHERE_BASE, sku },
    include: AI_INCLUDE,
  });
  return row ? summarise(row, loc) : null;
}

// ──────── buildRitual ──────────────────────────────────────────────────

/**
 * A "ritual" is one product per ordered category: cleanse → treat →
 * moisturise → protect. We always try in this order and stop early
 * rather than duplicating a step; better to return a 3-step routine
 * than to pad it with a product that doesn't fit.
 *
 * The category slugs below are the ones shipped in the initial seed.
 * If Elie adds new categories later, they simply won't be part of the
 * ritual template (which is fine — ritual is a fixed concept).
 */
export const RITUAL_SEQUENCE: ReadonlyArray<{
  step: "cleanse" | "essence" | "moisturise" | "protect";
  categorySlug: string;
}> = [
  { step: "cleanse",    categorySlug: "cleansers"   },
  { step: "essence",    categorySlug: "essences"    },
  { step: "moisturise", categorySlug: "moisturisers" },
  { step: "protect",    categorySlug: "sun-care"    },
];

export type RitualPick = {
  step: "cleanse" | "essence" | "moisturise" | "protect";
  product: AiProductSummary | null;
};

export type BuildRitualArgs = {
  locale: string;
  skinTypeSlugs?: string[];
  concernSlugs?: string[];
  maxPriceEur?: number;
};

/**
 * Build a 4-step routine from the catalogue, preferring products that
 * match the user's skin type and concern. Degrades gracefully:
 *
 *   1. Try products matching BOTH skin type AND concern
 *   2. If none, match either
 *   3. If still none, pick bestseller in the category
 *   4. If the category is empty, that step stays null (UI hides it)
 */
export async function buildRitual(args: BuildRitualArgs): Promise<RitualPick[]> {
  const usedIds = new Set<string>();

  const picks: RitualPick[] = [];
  for (const slot of RITUAL_SEQUENCE) {
    // Tier 1: strictly on match
    let match = await searchCatalog({
      locale: args.locale,
      categorySlugs: [slot.categorySlug],
      skinTypeSlugs: args.skinTypeSlugs,
      concernSlugs: args.concernSlugs,
      maxPriceEur: args.maxPriceEur,
      limit: 3,
    });
    // Tier 2: drop the stricter axis (concern), keep skin type
    if (match.length === 0 && args.skinTypeSlugs?.length) {
      match = await searchCatalog({
        locale: args.locale,
        categorySlugs: [slot.categorySlug],
        skinTypeSlugs: args.skinTypeSlugs,
        maxPriceEur: args.maxPriceEur,
        limit: 3,
      });
    }
    // Tier 3: bestseller in category
    if (match.length === 0) {
      match = await searchCatalog({
        locale: args.locale,
        categorySlugs: [slot.categorySlug],
        limit: 3,
      });
    }

    const pick = match.find((p) => !usedIds.has(p.id)) ?? null;
    if (pick) usedIds.add(pick.id);
    picks.push({ step: slot.step, product: pick });
  }

  return picks;
}
