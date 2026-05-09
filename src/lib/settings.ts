// ─────────────────────────────────────────────────────────────────────────
// Typed settings helpers.
//
// Settings live in a single key/value table (Setting.key → Setting.valueJson).
// This module is the *only* thing that knows about that shape. Callers get
// typed getters and setters per section, with defaults baked in so the
// first read on a fresh DB doesn't crash.
//
// Convention: section keys are dotted, e.g. `store`, `shipping`, `tax`,
// `seo`, `ai`. One row per section keeps writes atomic.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

// ──────── shapes ────────────────────────────────────────────────────────

export type StoreSettings = {
  name: string;
  supportEmail: string;
  supportPhone: string;
  /** Free-text line shown in the checkout confirmation email. */
  signOff: string;
};

export type ShippingSettings = {
  /** Order subtotal (in cents, ex-tax) above which shipping is free. 0 = never free. */
  freeThresholdCents: number;
  /** Flat-rate shipping cost in cents for orders under the threshold. */
  flatRateCents: number;
  /** The two-letter country codes we'll ship to. Empty = no restriction. */
  allowedCountries: string[];
  /** Short disclaimer shown on the shipping info page. */
  disclaimer: string;
};

export type TaxSettings = {
  /** VAT rate as a percent, e.g. 21 for 21% (Belgium standard rate). */
  ratePercent: number;
  /** If true, product prices shown to customers already include VAT. */
  includedInPrice: boolean;
  /** Country-specific override table, keyed by ISO country code. Optional. */
  overrides: Record<string, number>;
};

export type SeoSettings = {
  defaultTitle: string;
  defaultDescription: string;
  /** Absolute URL to the OpenGraph image. Leave blank to fall back to hero. */
  ogImageUrl: string;
  /** robots.txt body. Defaults to allow-all. */
  robotsTxt: string;
};

export type AiSettings = {
  /** Master toggle: disables the floating AI skin assistant when false. */
  enabled: boolean;
  /** Shown on the orb label + in the chat header. */
  assistantName: string;
  /** System prompt for the chat — the personality + rules the AI follows. */
  systemPrompt: string;
  /** If > 0, the AI will refuse queries above this many tokens. */
  maxResponseTokens: number;
};

// ──────── defaults ──────────────────────────────────────────────────────

// These are the values that apply when the DB row doesn't exist yet.
// Deliberately conservative and aligned with Asian Beauty Shop's Belgium/NL/FR/RU focus.

/**
 * Default system prompt for the AI concierge ("YU"). Editable from
 * /admin/settings → AI tab; this default is the fallback when no DB row
 * exists yet. Crafted as a proper concierge briefing — establishes
 * identity, mandates tool use before recommending any product, lists the
 * cross-checks (ingredient verification, pregnancy actives, layering
 * rules, scope limits), and an escalation path. Long but well within the
 * Llama 4 Scout context window; the response cap stays tight at
 * `maxResponseTokens` below so the model doesn't ramble.
 */
const DEFAULT_AI_SYSTEM_PROMPT = `You are YU, the in-house skincare concierge for Asian Beauty Shop — a Belgium-based curator of premium Korean skincare, serving customers across Belgium, the Netherlands, France, and Russian-speaking Europe.

# Your job

Help customers find products that genuinely match their skin. Build complete routines when they ask for one. Explain what an ingredient does and why a formula was chosen. Be the friend who actually reads the INCI list before recommending anything.

# Tools you have — USE THEM

You have THREE tools. Never recommend a product from memory — always look it up first. Hallucinated SKUs lose customer trust.

- **searchCatalog** — find candidate products by skin type, concern, category, price cap, or free-text. Use this first to narrow the list.
- **getProduct** — fetch full detail (including ingredient slugs) for a specific SKU. Use this to verify ingredients BEFORE claiming a product does something.
- **buildRitual** — assemble a full routine (cleanse → toner → treat → cream → mask → SPF) tailored to a skin profile. Use when the customer asks for a complete routine, not for individual products.

# How to recommend a product

1. **Translate the customer's words into filter slugs.**
   - Skin types: dry, oily, combo, sensitive, normal
   - Concerns: hydration, acne, dark-spots, redness, fine-lines, firmness, sun-damage, texture, dullness, pores, dark-circles, tightness, sensitive-eyes
   - Categories: cleansers, toners, serums, moisturizers, sunscreens, masks, treatments, lip-eye-care, exfoliators
2. **Search.** Call searchCatalog with those filters. Pass maxPriceEur if the customer mentioned a budget.
3. **Cross-check the ingredients.** Before claiming a benefit, call getProduct on the candidate and verify the ingredientSlugs actually contain the relevant active. Examples:
   - "Brightening" → look for niacinamide, ascorbic-acid (vitamin C), alpha-arbutin, tranexamic-acid, licorice-extract
   - "Hydrating" → hyaluronic-acid, sodium-hyaluronate, glycerin, panthenol, beta-glucan, ceramides
   - "Anti-aging / firming" → retinol/retinal/retinyl-derivatives, peptides, copper-tripeptide, bakuchiol, niacinamide
   - "Soothing / redness" → centella-asiatica, panthenol, allantoin, beta-glucan, madecassoside
   - "Acne / oily" → niacinamide, salicylic-acid, tea-tree, zinc-pca, azelaic-acid
   - "Sun protection" → titanium-dioxide, zinc-oxide, organic UV filters
4. **If the active is NOT in the ingredient list, do not claim it.** Pick a different product, or say honestly "this isn't the strongest match — here's what we do have for [need]".
5. **Recommend in one or two sentences per product.** Always pair the product with the ingredient(s) that justify the pick.

# Cross-checks before any recommendation

- **Pregnancy / breastfeeding** — if the customer mentions either, flag and avoid: any retinoid (retinol, retinal, retinyl-anything, tretinoin), salicylic-acid above 2%, hydroquinone, high-dose essential oils. Suggest a pregnancy-safer alternative from the catalogue (centella-asiatica, niacinamide, hyaluronic-acid, ceramides, mineral SPF). Tell them to consult a healthcare professional before starting anything new.
- **Sensitive skin** — never lead with strong actives. Centella, panthenol, low-percentage niacinamide first. Add stronger actives (retinoids, AHA/BHA) only after the customer has shown tolerance.
- **Layering** — never pair vitamin C with retinoids in the same step. Don't combine multiple strong exfoliants. Spread strong actives across morning vs. evening.
- **Routine order** — cleanser → toner → essence → serum/ampoule → eye cream → moisturizer → SPF (morning) / sleeping mask (evening).
- **Allergies** — if the customer mentions an allergy or past reaction, search ingredients carefully and exclude products containing the trigger.

# What you DO NOT do

- Don't recommend products outside the Asian Beauty Shop catalogue. Ever.
- Don't invent ingredients, certifications, percentages, or clinical-study claims.
- Don't make medical diagnoses. For acne, eczema, rosacea, dermatitis, perioral dermatitis — recommend the customer consult a dermatologist alongside any product suggestion.
- Don't promise specific timeframes ("results in 2 weeks"). Use "this active is well-studied for X" or "many customers see improvement over 4-8 weeks of consistent use" instead.
- Don't guess INCI percentages — the catalogue doesn't carry them; just say which actives are present.

# Style

- **Reply in the customer's language** — they typed in EN/NL/FR/RU; reply in the same.
- **Stay concise.** A single product recommendation = 1-2 sentences. A full routine = 6 short bullets, one per step.
- **Cite the active.** Every product mention should pair the SKU/name with one or two ingredients that justify the pick.
- **Warm, not gushy.** Treat the customer like a smart adult who reads ingredient lists.
- **No emojis** unless the customer used them first.

# When to escalate

If the customer asks something outside catalogue + tools — order status, payment issue, refund, custom request, complaint, ingredient documentation request, wholesale enquiry, anything legal — politely point them at info@kelmusgroup.eu and tell them the team replies within one working day. Don't make up an answer.`;

const DEFAULTS = {
  store: {
    name: "Asian Beauty Shop",
    supportEmail: "info@kelmusgroup.eu",
    supportPhone: "",
    signOff: "Thank you for choosing Asian Beauty Shop.",
  } satisfies StoreSettings,

  shipping: {
    // Free-shipping threshold lowered to €50 — low enough that a single
    // mid-priced product or a 2-product ritual reaches it. The previous
    // €99.99 made customers do mental math; €50 is a clean conversion
    // signal an admin can also use as marketing copy ("From €50, delivery
    // is free"). Live override still editable in /admin/settings/shipping.
    freeThresholdCents: 5000,
    flatRateCents: 595,
    allowedCountries: ["BE", "NL", "FR", "LU", "DE"],
    disclaimer:
      "Free shipping on orders over €50. Orders ship within 1–2 working days from Belgium. Delivery takes 2–5 days depending on destination.",
  } satisfies ShippingSettings,

  tax: {
    ratePercent: 21,
    includedInPrice: true,
    overrides: {},
  } satisfies TaxSettings,

  seo: {
    defaultTitle: "Asian Beauty Shop · Korean and Asian skincare in Europe",
    defaultDescription:
      "Minimalist Korean skincare routines, curated and shipped from Europe. Clinically-considered formulas, sensorial textures.",
    ogImageUrl: "",
    robotsTxt: "User-agent: *\nAllow: /\nDisallow: /admin\n",
  } satisfies SeoSettings,

  ai: {
    enabled: true,
    assistantName: "YU",
    systemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
    maxResponseTokens: 600,
  } satisfies AiSettings,
};

export type SettingsBundle = {
  store: StoreSettings;
  shipping: ShippingSettings;
  tax: TaxSettings;
  seo: SeoSettings;
  ai: AiSettings;
};

// ──────── IO ────────────────────────────────────────────────────────────

type Section = keyof SettingsBundle;
const SECTIONS: Section[] = ["store", "shipping", "tax", "seo", "ai"];

/**
 * Load every section. Missing keys fall back to DEFAULTS, and any field
 * missing from the stored JSON is merged in (so new fields don't require
 * a manual migration — they show up with their default).
 */
export async function readSettings(): Promise<SettingsBundle> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: SECTIONS as string[] } },
  });

  const byKey = new Map(rows.map((r) => [r.key, r.valueJson]));
  return {
    store: merge(DEFAULTS.store, byKey.get("store")),
    shipping: mergeShipping(DEFAULTS.shipping, byKey.get("shipping")),
    tax: mergeTax(DEFAULTS.tax, byKey.get("tax")),
    seo: merge(DEFAULTS.seo, byKey.get("seo")),
    ai: merge(DEFAULTS.ai, byKey.get("ai")),
  };
}

/** Read one section. Useful on the AI chat route where we only want the AI config. */
export async function readSetting<K extends Section>(
  section: K,
): Promise<SettingsBundle[K]> {
  const row = await prisma.setting.findUnique({ where: { key: section } });
  if (!row) return DEFAULTS[section];
  if (section === "shipping") {
    return mergeShipping(
      DEFAULTS.shipping,
      row.valueJson,
    ) as SettingsBundle[K];
  }
  if (section === "tax") {
    return mergeTax(DEFAULTS.tax, row.valueJson) as SettingsBundle[K];
  }
  return merge(DEFAULTS[section], row.valueJson) as SettingsBundle[K];
}

/** Overwrite one section atomically. The value is validated by the caller. */
export async function writeSetting<K extends Section>(
  section: K,
  value: SettingsBundle[K],
  updatedBy?: string | null,
): Promise<void> {
  await prisma.setting.upsert({
    where: { key: section },
    create: {
      key: section,
      valueJson: value as object,
      updatedBy: updatedBy ?? null,
    },
    update: { valueJson: value as object, updatedBy: updatedBy ?? null },
  });
}

// ──────── merge helpers ────────────────────────────────────────────────
// Shallow-merge the stored JSON on top of defaults so we're resilient to
// schema drift. Arrays and nested objects in Shipping/Tax need their own
// handlers because a shallow merge would replace them blindly; we want
// to fall back per-field.

function merge<T extends object>(def: T, stored: unknown): T {
  if (!stored || typeof stored !== "object") return def;
  return { ...def, ...(stored as Partial<T>) };
}

function mergeShipping(
  def: ShippingSettings,
  stored: unknown,
): ShippingSettings {
  if (!stored || typeof stored !== "object") return def;
  const s = stored as Partial<ShippingSettings>;
  return {
    freeThresholdCents:
      typeof s.freeThresholdCents === "number"
        ? s.freeThresholdCents
        : def.freeThresholdCents,
    flatRateCents:
      typeof s.flatRateCents === "number" ? s.flatRateCents : def.flatRateCents,
    allowedCountries: Array.isArray(s.allowedCountries)
      ? s.allowedCountries.filter((c): c is string => typeof c === "string")
      : def.allowedCountries,
    disclaimer: typeof s.disclaimer === "string" ? s.disclaimer : def.disclaimer,
  };
}

function mergeTax(def: TaxSettings, stored: unknown): TaxSettings {
  if (!stored || typeof stored !== "object") return def;
  const s = stored as Partial<TaxSettings>;
  return {
    ratePercent:
      typeof s.ratePercent === "number" ? s.ratePercent : def.ratePercent,
    includedInPrice:
      typeof s.includedInPrice === "boolean"
        ? s.includedInPrice
        : def.includedInPrice,
    overrides:
      s.overrides && typeof s.overrides === "object"
        ? Object.fromEntries(
            Object.entries(s.overrides).filter(
              ([, v]) => typeof v === "number",
            ) as [string, number][],
          )
        : def.overrides,
  };
}

/** Re-export defaults so migrations or seeds can pull them without guessing. */
export { DEFAULTS as SETTINGS_DEFAULTS };
