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
// Deliberately conservative and aligned with YurSkin's Belgium/NL/FR/RU focus.

const DEFAULTS = {
  store: {
    name: "YU.R Skin Solution",
    supportEmail: "hello@yurskinsolution.eu",
    supportPhone: "",
    signOff: "Thank you for choosing YU.R.",
  } satisfies StoreSettings,

  shipping: {
    freeThresholdCents: 7500,
    flatRateCents: 595,
    allowedCountries: ["BE", "NL", "FR", "LU", "DE"],
    disclaimer:
      "Orders ship within 1–2 working days from Belgium. Delivery takes 2–5 days depending on destination.",
  } satisfies ShippingSettings,

  tax: {
    ratePercent: 21,
    includedInPrice: true,
    overrides: {},
  } satisfies TaxSettings,

  seo: {
    defaultTitle: "YU.R Skin Solution · Korean skincare in Europe",
    defaultDescription:
      "Minimalist Korean skincare routines, curated and shipped from Europe. Clinically-considered formulas, sensorial textures.",
    ogImageUrl: "",
    robotsTxt: "User-agent: *\nAllow: /\nDisallow: /admin\n",
  } satisfies SeoSettings,

  ai: {
    enabled: true,
    assistantName: "YU",
    systemPrompt:
      "You are YU, the in-house skincare concierge for YU.R Skin Solution — a Korean skincare shop serving customers across Belgium, the Netherlands, France, and Russian-speaking Europe.\n\nSpeak in the customer's language, stay concise, and recommend products only from the YU.R catalogue. Never invent ingredients, certifications, or results. When unsure, say so and invite the customer to email hello@yurskinsolution.eu.",
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
