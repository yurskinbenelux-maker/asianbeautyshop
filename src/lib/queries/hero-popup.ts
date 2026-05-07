// ─────────────────────────────────────────────────────────────────────────
// Hero popup — server-side read/write helpers.
//
// Pure types, defaults, and HERO_POPUP_FIELDS live in `hero-popup-types.ts`
// because client components (the admin form) need to import them and
// Next 15 refuses to bundle a "server-only" module into a client tree.
//
// The popup itself (src/components/marketing/hero-popup.tsx) is a centred
// editorial card on the homepage. Queue position: welcome → hero → quiz.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { Locale, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

import {
  EMPTY_COPY,
  HERO_POPUP_DEFAULT_EN,
  type HeroPopupCopy,
  type HeroPopupPickerOption,
  type HeroPopupProductCard,
  type HeroPopupSettings,
} from "./hero-popup-types";

// Re-export the public types/constants from this module so existing
// callsites that import from "@/lib/queries/hero-popup" don't have to
// know about the split. Server callers get the full surface.
export {
  EMPTY_COPY,
  HERO_POPUP_DEFAULT_EN,
  HERO_POPUP_FIELDS,
  type HeroPopupCopy,
  type HeroPopupPickerOption,
  type HeroPopupProductCard,
  type HeroPopupSettings,
} from "./hero-popup-types";

const SETTING_KEY = "marketing.hero_popup";

export const HERO_POPUP_DEFAULTS: HeroPopupSettings = {
  enabled: false,
  delaySeconds: 3,
  productIds: [],
  copy: {
    [Locale.EN]: HERO_POPUP_DEFAULT_EN,
    [Locale.NL]: { ...EMPTY_COPY },
    [Locale.FR]: { ...EMPTY_COPY },
    [Locale.RU]: { ...EMPTY_COPY },
  },
};

// ────────── coercion helpers (tolerant of missing/garbage JSON) ─────────

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function asProductIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, 6);
}

function asCopy(v: unknown, fallback: HeroPopupCopy): HeroPopupCopy {
  if (!v || typeof v !== "object") return fallback;
  const o = v as Record<string, unknown>;
  return {
    eyebrow: asString(o.eyebrow, fallback.eyebrow),
    headline: asString(o.headline, fallback.headline),
    lede: asString(o.lede, fallback.lede),
    skipLabel: asString(o.skipLabel, fallback.skipLabel),
    hintLabel: asString(o.hintLabel, fallback.hintLabel),
  };
}

// ────────── read ────────────────────────────────────────────────────────

export async function readHeroPopupSettings(): Promise<HeroPopupSettings> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
      select: { valueJson: true },
    });
    if (!row) return HERO_POPUP_DEFAULTS;

    const v = row.valueJson as Record<string, unknown> | null;
    if (!v || typeof v !== "object") return HERO_POPUP_DEFAULTS;

    const copyV = (v.copy ?? {}) as Record<string, unknown>;

    return {
      enabled: asBool(v.enabled, HERO_POPUP_DEFAULTS.enabled),
      delaySeconds: asInt(
        v.delaySeconds,
        HERO_POPUP_DEFAULTS.delaySeconds,
        0,
        60,
      ),
      productIds: asProductIds(v.productIds),
      copy: {
        [Locale.EN]: asCopy(copyV[Locale.EN], HERO_POPUP_DEFAULTS.copy.EN),
        [Locale.NL]: asCopy(copyV[Locale.NL], EMPTY_COPY),
        [Locale.FR]: asCopy(copyV[Locale.FR], EMPTY_COPY),
        [Locale.RU]: asCopy(copyV[Locale.RU], EMPTY_COPY),
      },
    };
  } catch (err) {
    console.error("[hero-popup] read failed, using defaults", err);
    return HERO_POPUP_DEFAULTS;
  }
}

// ────────── write ───────────────────────────────────────────────────────

export async function writeHeroPopupSettings(
  next: HeroPopupSettings,
): Promise<void> {
  const safe: HeroPopupSettings = {
    enabled: !!next.enabled,
    delaySeconds: asInt(next.delaySeconds, 3, 0, 60),
    productIds: asProductIds(next.productIds),
    copy: {
      [Locale.EN]: asCopy(next.copy?.EN, HERO_POPUP_DEFAULTS.copy.EN),
      [Locale.NL]: asCopy(next.copy?.NL, EMPTY_COPY),
      [Locale.FR]: asCopy(next.copy?.FR, EMPTY_COPY),
      [Locale.RU]: asCopy(next.copy?.RU, EMPTY_COPY),
    },
  };
  const json = safe as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: json },
    update: { valueJson: json },
  });
}

// ────────── render-time helper ──────────────────────────────────────────

export function resolveHeroPopupCopy(
  cfg: HeroPopupSettings,
  locale: Locale,
): HeroPopupCopy {
  const en = cfg.copy[Locale.EN];
  const requested = cfg.copy[locale] ?? EMPTY_COPY;
  const pick = (k: keyof HeroPopupCopy) =>
    requested[k]?.trim() ? requested[k] : en[k];
  return {
    eyebrow: pick("eyebrow"),
    headline: pick("headline"),
    lede: pick("lede"),
    skipLabel: pick("skipLabel"),
    hintLabel: pick("hintLabel"),
  };
}

// ────────── render-time product hydration ───────────────────────────────

export async function getHeroPopupProductCards(
  cfg: HeroPopupSettings,
  locale: Locale,
): Promise<HeroPopupProductCard[]> {
  if (cfg.productIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: cfg.productIds }, deletedAt: null },
    select: {
      id: true,
      media: {
        where: { kind: "IMAGE" },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { url: true },
      },
      translations: {
        where: { locale: { in: [locale, Locale.EN] } },
        select: { locale: true, name: true, slug: true },
      },
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const cards: HeroPopupProductCard[] = [];
  for (const id of cfg.productIds) {
    const p = byId.get(id);
    if (!p) continue;
    const t =
      p.translations.find((x) => x.locale === locale) ??
      p.translations.find((x) => x.locale === Locale.EN);
    if (!t) continue;
    cards.push({
      id: p.id,
      name: t.name,
      slug: t.slug,
      imageUrl: p.media[0]?.url ?? "",
    });
  }
  return cards;
}

// ────────── admin product picker — list-all helper ──────────────────────

export async function listHeroPopupPickerOptions(): Promise<
  HeroPopupPickerOption[]
> {
  const rows = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      media: {
        where: { kind: "IMAGE" },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { url: true },
      },
      translations: {
        where: { locale: Locale.EN },
        select: { name: true, slug: true },
      },
    },
  });
  return rows
    .map((p) => ({
      id: p.id,
      name: p.translations[0]?.name ?? "(untitled)",
      slug: p.translations[0]?.slug ?? p.id,
      imageUrl: p.media[0]?.url ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
