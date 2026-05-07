// ─────────────────────────────────────────────────────────────────────────
// SiteCopy — admin-editable homepage + editorial copy.
//
// The contract is simple:
//   • SITE_COPY_SCHEMA defines every (section, field) the admin can edit.
//   • getSiteCopy(locale) returns a per-section dictionary:
//       { "home.hero": { eyebrow, title_pre, ... }, "footer": { ... } }
//   • Each field's value is: DB row for (section, field, locale)
//                         ?? DB row for (section, field, EN)
//                         ?? undefined (caller falls back to t())
//
//   The DB is "overrides only". An empty SiteCopy table = the site renders
//   entirely from messages/{locale}.json. This lets us ship without a seed
//   and gives an admin a safe rollback path (delete a row → revert to JSON).
//
// Call sites:
//   • Homepage components read specific sections via getSiteCopy(locale,
//     ["home.hero", "home.bestsellers", …]) — pass only what they need.
//   • The admin editor reads ALL rows for a section via listSiteCopyRows
//     so it can show one row per locale in the form.
//   • The admin save action calls upsertSiteCopy then revalidates.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { Locale } from "@prisma/client";

// ── 0. Void sentinel ──────────────────────────────────────────────────────
//
// The admin can mark any (section, field) as "hidden on the site". We
// implement that by writing this sentinel string into all 4 locale rows
// for that field. The public reader detects it and returns "" — short-
// circuiting the usual JSON-catalogue fallback so nothing renders.
//
// Stored in the value column rather than via a dedicated boolean column
// so we avoid a schema migration. The chance of legitimate copy
// containing this exact string is essentially zero.
export const SITE_COPY_VOID = "__SITE_COPY_VOID__";

// ── 1. Taxonomy ────────────────────────────────────────────────────────────
//
// The canonical list of (section, field) pairs. The admin UI walks this map
// to render the form; the runtime query walks it to decide which DB rows
// are even worth looking at. Keep in lockstep with the homepage components.
//
// Field order in each array IS the order the admin UI will show them — keep
// eyebrow / title / lede at the top, CTAs at the bottom. an admin will thank us.

export const SITE_COPY_SCHEMA = {
  "home.hero": [
    "eyebrow",
    "title_pre",
    "title_kr",
    "title_post",
    "lede",
    "cta_primary",
    "cta_secondary",
  ],
  "home.bestsellers": ["eyebrow", "lede"],
  "home.ritual": ["eyebrow", "lede"],
  "home.testimonials": ["eyebrow", "lede"],
  "home.journal": ["eyebrow", "lede", "read_all"],
  "home.newsletter": ["title", "lede", "cta", "placeholder"],
  "search.empty": ["title", "body"],
  "journal.index": ["eyebrow", "title", "lede"],
  "footer": ["tagline", "rights"],
} as const satisfies Record<string, readonly string[]>;

export type SiteCopySection = keyof typeof SITE_COPY_SCHEMA;
export type SiteCopyField<S extends SiteCopySection> =
  (typeof SITE_COPY_SCHEMA)[S][number];

// Human-readable labels for the admin UI. Kept here (not in messages/)
// because they're never visible to end users — this is developer/admin copy.
export const SITE_COPY_SECTION_LABELS: Record<SiteCopySection, string> = {
  "home.hero": "Homepage · Hero",
  "home.bestsellers": "Homepage · Bestsellers",
  "home.ritual": "Homepage · Your Ritual",
  "home.testimonials": "Homepage · Testimonials",
  "home.journal": "Homepage · Journal teaser",
  "home.newsletter": "Homepage · Newsletter",
  "search.empty": "Search · Empty state",
  "journal.index": "Journal index",
  "footer": "Footer",
};

export const SITE_COPY_FIELD_LABELS: Record<string, string> = {
  eyebrow: "Eyebrow",
  title: "Title",
  title_pre: "Title · before the Korean character",
  title_kr: "Korean character",
  title_post: "Title · after the Korean character",
  lede: "Body / lede",
  cta_primary: "Primary CTA label",
  cta_secondary: "Secondary CTA label",
  read_all: "'Read all' label",
  cta: "CTA label",
  placeholder: "Input placeholder",
  body: "Body text",
  tagline: "Tagline",
  rights: "Rights / copyright line",
};

// ── 2. Types returned to components ───────────────────────────────────────

/**
 * A section's copy as a flat dict. Values that weren't set in the DB are
 * `undefined`, signalling the caller should fall back to `t(field)`.
 */
export type SectionCopy<S extends SiteCopySection> = Partial<
  Record<SiteCopyField<S>, string>
>;

/**
 * The return shape of getSiteCopy — one dict per section requested.
 */
export type SiteCopyDict = {
  [S in SiteCopySection]?: SectionCopy<S>;
};

// ── 2b. JSON fallback map ──────────────────────────────────────────────────
//
// Every (section, field) maps to a dotted path in messages/{locale}.json. The
// admin UI uses this to show an admin the current fallback value as a placeholder
// so she knows what the field will look like if she leaves her override blank.
// Public components do NOT need this — they call t(field) inside the right
// namespace and let next-intl resolve.

export const SITE_COPY_JSON_PATH: Record<
  SiteCopySection,
  Record<string, string>
> = {
  "home.hero": {
    eyebrow: "hero.eyebrow",
    title_pre: "hero.title_pre",
    title_kr: "hero.title_kr",
    title_post: "hero.title_post",
    lede: "hero.lede",
    cta_primary: "hero.cta_primary",
    cta_secondary: "hero.cta_secondary",
  },
  "home.bestsellers": {
    eyebrow: "section.bestsellers",
    lede: "section.bestsellers_lede",
  },
  "home.ritual": {
    eyebrow: "section.ritual",
    lede: "section.ritual_lede",
  },
  "home.testimonials": {
    eyebrow: "section.testimonials",
    lede: "section.testimonials_lede",
  },
  "home.journal": {
    eyebrow: "section.journal",
    lede: "section.journal_lede",
    read_all: "section.journal_read_all",
  },
  "home.newsletter": {
    title: "section.newsletter_title",
    lede: "section.newsletter_lede",
    cta: "section.newsletter_cta",
    placeholder: "section.newsletter_placeholder",
  },
  "search.empty": {
    title: "search.empty_title",
    body: "search.empty_body",
  },
  "journal.index": {
    eyebrow: "journal.eyebrow",
    title: "journal.title",
    lede: "journal.lede",
  },
  footer: {
    tagline: "brand.tagline",
    rights: "footer.rights",
  },
};

/**
 * Look up the fallback value for (section, field) in an already-loaded
 * messages catalogue (see messagesByLocale() below). Returns undefined if
 * the path doesn't resolve — shouldn't happen but defensive is cheap.
 */
export function jsonFallback(
  messages: Record<string, unknown>,
  section: SiteCopySection,
  field: string,
): string | undefined {
  const path = SITE_COPY_JSON_PATH[section]?.[field];
  if (!path) return undefined;
  const parts = path.split(".");
  let node: unknown = messages;
  for (const p of parts) {
    if (node && typeof node === "object" && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

// ── 3. Runtime query: read for the public site ────────────────────────────

function normaliseLocale(urlLocale: string): Locale {
  return urlLocale.toUpperCase() as Locale;
}

/**
 * Fetch admin overrides for the requested sections in one query.
 * Falls back from `locale` → EN. Returns an empty dict if nothing is set.
 *
 * Pass `sections` to narrow the query (homepage doesn't need footer copy,
 * etc.). Omit to get everything — useful for the admin preview.
 */
export async function getSiteCopy(
  urlLocale: string,
  sections?: readonly SiteCopySection[],
): Promise<SiteCopyDict> {
  const locale = normaliseLocale(urlLocale);
  const wanted = (sections ?? (Object.keys(SITE_COPY_SCHEMA) as SiteCopySection[]));

  const rows = await prisma.siteCopy.findMany({
    where: {
      section: { in: wanted as unknown as string[] },
      locale: { in: [locale, Locale.EN] },
    },
    select: { section: true, field: true, locale: true, value: true },
  });

  // Build (section, field) → { byLocale } map so we can prefer the caller's
  // locale and fall back to EN per field, not per section.
  const byKey = new Map<string, { primary?: string; en?: string }>();
  for (const r of rows) {
    const k = `${r.section}::${r.field}`;
    const slot = byKey.get(k) ?? {};
    if (r.locale === locale) slot.primary = r.value;
    if (r.locale === Locale.EN) slot.en = r.value;
    byKey.set(k, slot);
  }

  const out: SiteCopyDict = {};
  for (const section of wanted) {
    const fields = SITE_COPY_SCHEMA[section];
    const dict: Record<string, string> = {};
    for (const field of fields) {
      const slot = byKey.get(`${section}::${field}`);
      const value = slot?.primary ?? slot?.en;
      if (value !== undefined) dict[field] = value;
    }
    // Cast narrows back to SectionCopy<S>; Partial<Record<…>> admits this.
    (out as Record<string, Record<string, string>>)[section] = dict;
  }
  return out;
}

/**
 * Convenience: fall back from an override to a translation in one expression.
 *
 *   const copy = await getSiteCopy(locale, ["home.hero"]);
 *   const t    = await getTranslations("hero");
 *   siteCopy(copy, "home.hero", "lede", t)   // string
 */
export function siteCopy<S extends SiteCopySection>(
  dict: SiteCopyDict,
  section: S,
  field: SiteCopyField<S>,
  t: (key: string) => string,
): string {
  // Loose lookup — we index into the section dict as a plain string map so
  // the generic section/field parameters don't trip up TS's narrowing.
  const sectionDict = dict[section] as Record<string, string> | undefined;
  const override = sectionDict?.[field as string];
  // Voided fields short-circuit to "" — the public component renders the
  // empty value and (when it conditionally renders against truthiness)
  // skips the wrapper entirely. No fallback to the JSON catalogue.
  if (override === SITE_COPY_VOID) return "";
  if (typeof override === "string" && override.length > 0) return override;
  // The JSON catalogue key is just the field name (hero.lede, footer.tagline,
  // etc.) since each component already calls getTranslations(section-ns).
  return t(field as string);
}

/**
 * Cheap "is this (section, field) currently hidden?" check for any caller
 * that needs to take a different action (e.g. skip a wrapper) when the
 * field is voided rather than just having an empty string fall through.
 */
export function isFieldVoided<S extends SiteCopySection>(
  dict: SiteCopyDict,
  section: S,
  field: SiteCopyField<S>,
): boolean {
  const sectionDict = dict[section] as Record<string, string> | undefined;
  return sectionDict?.[field as string] === SITE_COPY_VOID;
}

/**
 * Same contract as siteCopy() but takes a literal fallback string rather
 * than a translator. Used by callers where the JSON catalogue key doesn't
 * line up 1:1 with our (section, field) schema — e.g. our
 * `home.bestsellers::eyebrow` maps to `section.bestsellers`, not
 * `bestsellers.eyebrow`. The caller resolves the right t() value first
 * and passes it in.
 *
 * Critically, this honours the SITE_COPY_VOID sentinel — if an admin has
 * marked the field hidden in admin, this returns "" instead of leaking
 * the literal sentinel string to the page (which is what the inline
 * `?? tSection(...)` call sites used to do).
 */
export function siteCopyOr<S extends SiteCopySection>(
  dict: SiteCopyDict,
  section: S,
  field: SiteCopyField<S>,
  fallback: string,
): string {
  const sectionDict = dict[section] as Record<string, string> | undefined;
  const override = sectionDict?.[field as string];
  if (override === SITE_COPY_VOID) return "";
  if (typeof override === "string" && override.length > 0) return override;
  return fallback;
}

// ── 4. Admin queries ──────────────────────────────────────────────────────

export type SiteCopyRow = {
  section: string;
  field: string;
  locale: Locale;
  value: string;
};

/**
 * Every row for a section, across all locales — so the admin form can show
 * a per-locale editor per field. Missing (field, locale) combinations are
 * NOT filled in here; the caller is expected to walk SITE_COPY_SCHEMA and
 * show an empty input so an admin can type a value.
 */
export async function listSiteCopyRows(
  section: SiteCopySection,
): Promise<SiteCopyRow[]> {
  return prisma.siteCopy.findMany({
    where: { section },
    select: { section: true, field: true, locale: true, value: true },
    orderBy: [{ field: "asc" }, { locale: "asc" }],
  });
}

/**
 * Upsert a single (section, field, locale) row. Empty string → delete row
 * (so an admin can revert to the JSON fallback by clearing the input). Called
 * from the /admin/homepage server action.
 */
export async function upsertSiteCopy(args: {
  section: SiteCopySection;
  field: string;
  locale: Locale;
  value: string;
  updatedBy?: string | null;
}): Promise<void> {
  const { section, field, locale, value, updatedBy } = args;

  // Validate field belongs to section — stops typos from creating orphan rows.
  const allowed = SITE_COPY_SCHEMA[section] as readonly string[];
  if (!allowed.includes(field)) {
    throw new Error(
      `Unknown SiteCopy field "${field}" for section "${section}"`,
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    // Deleting is idempotent — no-op if the row never existed.
    await prisma.siteCopy.deleteMany({ where: { section, field, locale } });
    return;
  }

  await prisma.siteCopy.upsert({
    where: { section_field_locale: { section, field, locale } },
    create: {
      section,
      field,
      locale,
      value: trimmed,
      updatedBy: updatedBy ?? null,
    },
    update: {
      value: trimmed,
      updatedBy: updatedBy ?? null,
    },
  });
}
