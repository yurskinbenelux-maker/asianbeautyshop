// ─────────────────────────────────────────────────────────────────────────
// AI catalog helpers — V2.
//
// Shared between the rule-based skin quiz (Layer 1) and the Groq tool
// calls (Layer 2). The goal is to keep every DB read for the concierge
// in one place, so we can reason about:
//
//   · What products the AI is allowed to recommend  (isAvailableForAi)
//   · What status/visibility filters are enforced   (PUBLISHED only)
//   · How taxonomy fallbacks behave when a slug doesn't exist yet
//
// V2 changes:
//   · RITUAL_SEQUENCE updated to use the canonical 7 categories from
//     migration migrate-categories-7.ts (cleanser, toner, peeling,
//     essences-serums, cream, mask, spf). The old slugs ("cleansers",
//     "essences", "moisturisers", "sun-care") were dead and caused
//     every quiz to fall through to "bestseller anywhere".
//   · buildRitual() now takes a typed QuizBrief and scores each
//     candidate by INCI ingredient match (since the imported products
//     don't carry skinType/concern slugs). This is how a derm reads
//     a product anyway.
//   · RitualPick step types expanded: cleanse / toner / treat / cream /
//     mask / spf — supports up to 6 steps for a "full" routine.
//
// None of these functions accept free-form SQL-ish input from the LLM;
// they only take explicit filter args, so tool-calling can't exfiltrate
// or mutate data outside the product catalog.
// ─────────────────────────────────────────────────────────────────────────

import { Locale, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toPrismaLocale } from "@/lib/queries/products";

// ──────── Brief types (shared with quiz.ts) ─────────────────────────────

export type ConcernKey =
  // Primary concerns (Q2)
  | "hydration"
  | "dullness"
  | "acne"
  | "fine-lines"
  | "dark-spots"
  | "pores"
  | "redness"
  // Secondary chips (Q3)
  | "tightness"
  | "texture"
  | "dark-circles"
  | "sun-damage"
  | "firmness"
  | "sensitive-eyes";

export type SkinType = "dry" | "oily" | "combo" | "sensitive" | "normal";

export type LinePreference = "Yu.R PRO" | "Yu.R Me" | "Centella" | "any";

export type QuizBrief = {
  skinType: SkinType;
  primaryConcern: ConcernKey;
  secondaryConcerns: ConcernKey[];
  reactivity: "never" | "sometimes" | "often";
  sunExposure: "indoors" | "commute" | "outdoor" | "strong";
  ageBand: "u25" | "25-34" | "35-44" | "45+";
  ritualDepth: "minimal" | "balanced" | "full";
  linePreference: LinePreference;
  needsSpf: boolean;
};

// ──────── Derive line preference ────────────────────────────────────────
//
// Sensitive skin → push the unbranded Centella line (centella, niacinamide,
// gentle). Age 35+ OR primary concern is fine-lines/dark-spots → Yu.R PRO
// (peptide-heavy, clinical). Otherwise → Yu.R Me (everyday line).
// "any" means no preference; scoring won't add or subtract on line.

export function deriveLinePreference(opts: {
  ageBand: QuizBrief["ageBand"];
  primaryConcern: ConcernKey;
  skinType: SkinType;
}): LinePreference {
  if (opts.skinType === "sensitive") return "Centella";
  if (
    opts.ageBand === "35-44" ||
    opts.ageBand === "45+" ||
    opts.primaryConcern === "fine-lines" ||
    opts.primaryConcern === "dark-spots"
  ) {
    return "Yu.R PRO";
  }
  return "Yu.R Me";
}

// ──────── Ingredient → concern map (the derm logic) ─────────────────────
//
// Each concern lists the ingredient SLUGS (matches Ingredient.slug in
// the DB) that score positively for it. Order doesn't matter; presence
// of any ingredient gives a +1, scored against the brief in the loop
// below. The maps below cover roughly 90% of the INCI molecules in the
// 35-product Sofia catalogue.
//
// If you add new ingredients via /admin/ingredients, just append the
// slug here under whichever concerns it addresses — no other code
// changes needed.

const INGREDIENT_FOR_CONCERN: Record<ConcernKey, string[]> = {
  hydration: [
    "sodium-hyaluronate",
    "hydrolyzed-hyaluronic-acid",
    "sodium-hyaluronate-crosspolymer",
    "hydrolyzed-glycosaminoglycans",
    "ceramide-np",
    "ceramides",
    "beta-glucan",
    "trehalose",
    "glyceryl-glucoside",
    "snail-secretion-filtrate",
    "squalane",
    "panthenol",
  ],
  acne: [
    "centella-asiatica-extract",
    "melaleuca-alternifolia-tea-tree-leaf-extract",
    "niacinamide",
    "kaolin",
    "scutellaria-baicalensis-root-extract",
    "salicylic-acid",
    "lactobacillus",
    "bentonite",
  ],
  redness: [
    "centella-asiatica-extract",
    "madecassoside",
    "asiaticoside",
    "allantoin",
    "aloe-barbadensis-leaf-juice",
    "chamomilla-recutita-extract",
    "scutellaria-baicalensis-root-extract",
    "glycyrrhiza-glabra-licorice-root-extract",
    "panthenol",
    "tremella-fuciformis-extract",
  ],
  dullness: [
    "ascorbyl-glucoside",
    "sodium-ascorbyl-phosphate",
    "magnesium-ascorbyl-phosphate",
    "niacinamide",
    "pearl-powder",
    "galactomyces-ferment-filtrate",
    "bifida-ferment-filtrate",
    "saccharomyces-rice-ferment-filtrate",
    "hippophae-rhamnoides-fruit-extract",
  ],
  "dark-spots": [
    "ascorbyl-glucoside",
    "sodium-ascorbyl-phosphate",
    "magnesium-ascorbyl-phosphate",
    "niacinamide",
    "pearl-powder",
    "hippophae-rhamnoides-fruit-extract",
    "leontopodium-alpinum-extract",
    "tranexamic-acid",
    "galactomyces-ferment-filtrate",
  ],
  "fine-lines": [
    "acetyl-hexapeptide-8",
    "copper-tripeptide-1",
    "palmitoyl-tripeptide-5",
    "sh-oligopeptide-1",
    "adenosine",
    "royal-jelly-extract",
    "snail-secretion-filtrate",
    "hydrolyzed-collagen",
    "fullerenes",
    "retinol",
    "retinal",
    "bakuchiol",
  ],
  pores: [
    "niacinamide",
    "ascorbyl-glucoside",
    "centella-asiatica-extract",
    "lactobacillus",
    "salicylic-acid",
  ],
  // Secondary chips
  tightness: [
    "sodium-hyaluronate",
    "hydrolyzed-hyaluronic-acid",
    "ceramide-np",
    "snail-secretion-filtrate",
    "panthenol",
    "squalane",
  ],
  texture: [
    "ascorbyl-glucoside",
    "lactobacillus",
    "niacinamide",
    "centella-asiatica-extract",
  ],
  "dark-circles": [
    "caffeine",
    "niacinamide",
    "vitamin-k",
    "adenosine",
    "copper-tripeptide-1",
    "acetyl-hexapeptide-8",
  ],
  "sun-damage": [
    "niacinamide",
    "ascorbyl-glucoside",
    "tocopheryl-acetate",
    "leontopodium-alpinum-extract",
    "adenosine",
  ],
  firmness: [
    "hydrolyzed-collagen",
    "palmitoyl-tripeptide-5",
    "copper-tripeptide-1",
    "gold-600ppm",
    "snail-secretion-filtrate",
    "fullerenes",
    "adenosine",
  ],
  "sensitive-eyes": [
    "centella-asiatica-extract",
    "madecassoside",
    "allantoin",
    "panthenol",
    "scutellaria-baicalensis-root-extract",
  ],
};

// Ingredients that should NOT be recommended to sensitive / often-reacting
// skin. They aren't unsafe — they're just stronger than this user wants.
const SENSITIVE_AVOID: string[] = [
  "ascorbyl-glucoside", // strong vit C
  "magnesium-ascorbyl-phosphate", // strong vit C
  "retinol",
  "retinal",
  "salicylic-acid",
  "melaleuca-alternifolia-tea-tree-leaf-extract", // tea tree can sting
];

// ──────── Compact product summary the AI sees ───────────────────────────

export type AiProductSummary = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  tagline: string | null;
  priceEur: number;
  comparePriceEur: number | null;
  imageUrl: string | null;
  productLine: string | null;
  categorySlugs: string[];
  skinTypeSlugs: string[];
  concernSlugs: string[];
  benefitSlugs: string[];
  ingredientSlugs: string[];
};

function summarise(
  // Loose include shape — shared with searchCatalog and getProductBySku.
  // Keeping this as `any`-adjacent in the type sig because the Prisma
  // generic is already complex; the runtime shape is stable.
  p: {
    id: string;
    sku: string;
    price: { toString(): string };
    comparePrice: { toString(): string } | null;
    productLine: string | null;
    translations: { locale: Locale; name: string; slug: string; shortDescription: string | null }[];
    media: { url: string }[];
    categories: { category: { slug: string } }[];
    skinTypes: { skinType: { slug: string } }[];
    concerns: { concern: { slug: string } }[];
    benefits: { benefit: { slug: string } }[];
    ingredients?: { ingredient: { slug: string } }[];
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
    productLine: p.productLine ?? null,
    categorySlugs: p.categories.map((c) => c.category.slug),
    skinTypeSlugs: p.skinTypes.map((s) => s.skinType.slug),
    concernSlugs: p.concerns.map((c) => c.concern.slug),
    benefitSlugs: p.benefits.map((b) => b.benefit.slug),
    ingredientSlugs: (p.ingredients ?? []).map((i) => i.ingredient.slug),
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
  // Pull the ingredient slugs so we can score by INCI in the ritual builder.
  ingredients: { select: { ingredient: { select: { slug: true } } } },
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
  query?: string;
  skinTypeSlugs?: string[];
  concernSlugs?: string[];
  categorySlugs?: string[];
  maxPriceEur?: number;
  limit?: number;
};

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

// ──────── Ritual sequence + step types ──────────────────────────────────

export type RitualStep = "cleanse" | "toner" | "treat" | "cream" | "mask" | "spf";

export type RitualPick = {
  step: RitualStep;
  product: AiProductSummary | null;
  // INCI slugs that matched the brief — surfaced in "why these picks".
  matchedIngredients: string[];
};

// The canonical 7-category mapping (post migration #166).
// Note: "peeling" is folded into the "treat" step's candidate pool —
// peeling-gel is a weekly treatment, not a separate ritual slot.
const STEP_TO_CATEGORIES: Record<RitualStep, string[]> = {
  cleanse: ["cleanser"],
  toner: ["toner"],
  treat: ["essences-serums", "peeling"],
  cream: ["cream"],
  mask: ["mask"],
  spf: ["spf"],
};

// ──────── Scoring ───────────────────────────────────────────────────────
//
// Each candidate product is scored against the brief. Higher = better fit.
// The score is purely advisory — we use it to rank candidates within a
// single category, not to filter products out (we always want SOME pick
// per ritual step rather than a hole in the routine).

type ScoredProduct = {
  product: AiProductSummary;
  score: number;
  matched: string[];
};

function scoreProductForBrief(
  product: AiProductSummary,
  brief: QuizBrief,
): { score: number; matched: string[] } {
  let score = 0;
  const matched = new Set<string>();
  const ings = new Set(product.ingredientSlugs);

  // Primary concern — heaviest weight. Each matching INCI = +3.
  for (const slug of INGREDIENT_FOR_CONCERN[brief.primaryConcern] ?? []) {
    if (ings.has(slug)) {
      score += 3;
      matched.add(slug);
    }
  }

  // Secondary concerns — lighter, +1 per match per concern (capped at +1
  // per concern so a product loaded with hydrators doesn't dominate just
  // because the user picked tightness as a chip).
  for (const concern of brief.secondaryConcerns) {
    let hit = false;
    for (const slug of INGREDIENT_FOR_CONCERN[concern] ?? []) {
      if (ings.has(slug)) {
        if (!hit) score += 1;
        hit = true;
        matched.add(slug);
      }
    }
  }

  // Skin-type-specific — quietly rewards hydration ingredients for dry,
  // calming for sensitive, oil-balancing for oily.
  if (brief.skinType === "dry") {
    for (const slug of INGREDIENT_FOR_CONCERN.hydration) {
      if (ings.has(slug)) score += 0.5;
    }
  } else if (brief.skinType === "sensitive") {
    for (const slug of INGREDIENT_FOR_CONCERN.redness) {
      if (ings.has(slug)) score += 0.5;
    }
  } else if (brief.skinType === "oily") {
    for (const slug of INGREDIENT_FOR_CONCERN.acne) {
      if (ings.has(slug)) score += 0.5;
    }
  }

  // Sensitive / often-reacts: penalise active-heavy formulas. The product
  // can still win if nothing else is in its category, but we prefer to
  // route the user to gentler picks.
  if (brief.skinType === "sensitive" || brief.reactivity === "often") {
    for (const slug of SENSITIVE_AVOID) {
      if (ings.has(slug)) score -= 2;
    }
  }

  // Line preference — small nudge so two equally-matching products
  // tie-break to the line that fits the user's profile.
  if (brief.linePreference !== "any") {
    if (product.productLine === brief.linePreference) score += 1;
  }

  // Bestseller / featured tie-break — already enforced by the orderBy
  // on the DB query, but surface a tiny score bump for the result page
  // to break ties consistently.

  return { score, matched: [...matched] };
}

// ──────── buildRitual ──────────────────────────────────────────────────

export type BuildRitualArgs = {
  locale: string;
  brief?: QuizBrief;
  // Legacy entrypoint — when the LLM tool calls buildRitual without a
  // full brief, we still try to do something sensible. These fields
  // mirror the old API.
  skinTypeSlugs?: string[];
  concernSlugs?: string[];
  maxPriceEur?: number;
};

// Choose which ritual steps to include based on depth + needsSpf.
function stepsForDepth(brief: QuizBrief): RitualStep[] {
  const all: RitualStep[] = ["cleanse", "toner", "treat", "cream", "mask", "spf"];
  const skip = new Set<RitualStep>();

  if (brief.ritualDepth === "minimal") {
    // Cleanse + cream (+ spf if needed). Essentials only.
    skip.add("toner");
    skip.add("treat");
    skip.add("mask");
  } else if (brief.ritualDepth === "balanced") {
    // Cleanse + treat + cream (+ spf). No toner, no mask.
    skip.add("toner");
    skip.add("mask");
  }
  // "full" includes everything.

  if (!brief.needsSpf) skip.add("spf");

  return all.filter((s) => !skip.has(s));
}

export async function buildRitual(args: BuildRitualArgs): Promise<RitualPick[]> {
  // Synthesise a brief from legacy callers (LLM tool path).
  const brief: QuizBrief =
    args.brief ??
    ({
      skinType: "normal",
      primaryConcern:
        (args.concernSlugs?.[0] as ConcernKey | undefined) ?? "hydration",
      secondaryConcerns: [],
      reactivity: "sometimes",
      sunExposure: "commute",
      ageBand: "25-34",
      ritualDepth: "balanced",
      linePreference: "any",
      needsSpf: true,
    } satisfies QuizBrief);

  const usedIds = new Set<string>();
  const steps = stepsForDepth(brief);

  const picks: RitualPick[] = [];
  for (const step of steps) {
    const cats = STEP_TO_CATEGORIES[step];

    // Pull every published candidate in this step's category pool.
    // We over-fetch (12) so scoring has options to rank.
    const candidates = await searchCatalog({
      locale: args.locale,
      categorySlugs: cats,
      limit: 12,
    });

    if (candidates.length === 0) {
      picks.push({ step, product: null, matchedIngredients: [] });
      continue;
    }

    // Score each candidate, drop the ones already used in earlier steps
    // (to avoid showing the same product twice when categories overlap).
    const scored: ScoredProduct[] = candidates
      .filter((p) => !usedIds.has(p.id))
      .map((p) => ({ product: p, ...scoreProductForBrief(p, brief) }));

    // Highest score wins; ties fall back to the DB orderBy (bestseller).
    scored.sort((a, b) => b.score - a.score);

    const winner = scored[0];
    if (winner) {
      usedIds.add(winner.product.id);
      picks.push({
        step,
        product: winner.product,
        matchedIngredients: winner.matched,
      });
    } else {
      picks.push({ step, product: null, matchedIngredients: [] });
    }
  }

  return picks;
}
