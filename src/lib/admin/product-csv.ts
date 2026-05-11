// ─────────────────────────────────────────────────────────────────────────
// product-csv.ts — pure CSV parse + row-shape validation for bulk product
// imports on /admin/products/import.
//
// This file has NO side effects and no DB access. The server action layer
// above it handles:
//   • Supabase auth gating
//   • resolving FK slugs (brand, categories, etc.) to UUIDs
//   • upserting Product + ProductTranslation + pivot rows
// Keeping the parser pure means a human can open this file, paste a CSV
// into a REPL, and see exactly why a row was rejected — no mocks needed.
//
// CSV format decisions (2026-04):
//   • RFC 4180 with CRLF line endings and doubled-double-quote escapes.
//   • UTF-8. A BOM at the start of the file is tolerated (common from
//     Excel) and silently stripped.
//   • Column keys are snake_case ASCII. Headers are case-insensitive.
//   • Semicolons separate multi-value pivot slugs (e.g. "cleanser;toner").
//     Commas would collide with CSV field separators.
//   • Images are intentionally OUT OF SCOPE. an admin uploads images through
//     the existing admin image editor — keeping the CSV data-only lets the
//     pure parser stay offline-testable, and avoids having to fetch remote
//     URLs from the request handler.
// ─────────────────────────────────────────────────────────────────────────

import { AudienceCategory, Locale, ProductStatus } from "@prisma/client";

// ────────── public types ────────────────────────────────────────────────

/** All columns the importer understands. Extra columns on the CSV are
 *  tolerated (ignored) so an admin can round-trip an export without trimming.
 *  Bumping this list is the only change needed to add a new field. */
export const CSV_COLUMNS = [
  // identity / status
  "sku",
  "status",
  "brand_slug",
  "product_line",        // sub-brand from supplier sheet, e.g. "Yu.R PRO"
  "barcode",             // EAN-13
  // pricing (all euros, decimal as "24.90" or "24,90")
  "price_eur",
  "compare_price_eur",
  "cost_eur",
  // physical
  "volume_ml",
  "weight_grams",
  "shelf_life_months",   // unopened shelf life
  "origin_country",      // ISO-3166 alpha-2, e.g. "KR"
  "hs_code",             // customs / HS classification
  "audience_category",   // UNISEX | WOMEN | MEN | KIDS | BABIES
  "inci_list",           // full INCI declaration (one long string, language-agnostic)
  // flags
  "is_featured",
  "is_bestseller",
  "is_available_for_ai",
  "hide_from_search",
  // dates
  "launched_at",
  // EN translation (required — fallback locale)
  "name_en",
  "slug_en",
  "short_description_en",
  "description_en",
  "how_to_use_en",
  "warnings_en",
  "seo_title_en",
  "seo_description_en",
  // NL
  "name_nl",
  "slug_nl",
  "short_description_nl",
  "description_nl",
  "how_to_use_nl",
  "warnings_nl",
  "seo_title_nl",
  "seo_description_nl",
  // FR
  "name_fr",
  "slug_fr",
  "short_description_fr",
  "description_fr",
  "how_to_use_fr",
  "warnings_fr",
  "seo_title_fr",
  "seo_description_fr",
  // RU
  "name_ru",
  "slug_ru",
  "short_description_ru",
  "description_ru",
  "how_to_use_ru",
  "warnings_ru",
  "seo_title_ru",
  "seo_description_ru",
  // pivot rows (semicolon-separated slugs)
  "category_slugs",
  "ingredient_slugs",
  "benefit_slugs",
  "skin_type_slugs",
  "concern_slugs",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** What a valid row looks like after parsing — ready to hand to the DB
 *  layer. Strings are trimmed, booleans coerced, prices parsed. The
 *  many-to-many fields arrive as arrays of slug strings; the DB layer
 *  resolves them into UUIDs. */
export type ValidatedRow = {
  rowNumber: number; // 1-based, excluding the header
  sku: string;
  status: ProductStatus;
  brandSlug: string | null;
  productLine: string | null;
  barcode: string | null;
  priceEur: string; // Decimal-safe string form, e.g. "24.90"
  comparePriceEur: string | null;
  costEur: string | null;
  volumeMl: number | null;
  weightGrams: number | null;
  shelfLifeMonths: number | null;
  originCountry: string | null;     // ISO-3166 alpha-2, uppercased
  hsCode: string | null;
  audienceCategory: AudienceCategory; // defaults to UNISEX when blank
  inciList: string | null;
  isFeatured: boolean;
  isBestseller: boolean;
  isAvailableForAi: boolean;
  hideFromSearch: boolean;
  launchedAt: Date | null;
  translations: ReadonlyArray<TranslationFields>;
  categorySlugs: ReadonlyArray<string>;
  ingredientSlugs: ReadonlyArray<string>;
  benefitSlugs: ReadonlyArray<string>;
  skinTypeSlugs: ReadonlyArray<string>;
  concernSlugs: ReadonlyArray<string>;
};

export type TranslationFields = {
  locale: Locale;
  name: string;
  slug: string; // either provided or derived from name
  shortDescription: string | null;
  description: string;
  howToUse: string | null;
  warnings: string | null;          // safety / regulatory copy, per locale
  seoTitle: string | null;
  seoDescription: string | null;
};

export type InvalidRow = {
  rowNumber: number;
  raw: Record<string, string>;
  errors: ReadonlyArray<string>;
};

export type ParseOutcome = {
  /** Any file-level problems (e.g. no header row, duplicate SKU). */
  fileErrors: ReadonlyArray<string>;
  valid: ReadonlyArray<ValidatedRow>;
  invalid: ReadonlyArray<InvalidRow>;
};

// ────────── CSV tokeniser (RFC 4180) ────────────────────────────────────

/**
 * Parse a CSV string into `{ headers, rows }`. Rows are objects keyed by
 * header name (lowercased). Unknown headers are retained so we can report
 * them as warnings — we intentionally don't drop them here.
 *
 * We roll this by hand rather than pull in papaparse: the shape we accept
 * is small (no streaming, no multi-byte tricks), the conformance surface
 * is therefore small too, and the existing CSV *export* code elsewhere in
 * this repo is hand-rolled too — matching styles keeps the codebase
 * readable.
 */
export function tokenizeCsv(input: string): {
  headers: string[];
  rows: string[][];
} {
  // Strip UTF-8 BOM if present (Excel on Windows emits it).
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const len = input.length;

  const commit = () => {
    cur.push(cell);
    cell = "";
  };
  const endRow = () => {
    commit();
    // Skip rows that are entirely blank (happens after trailing newlines).
    if (!(cur.length === 1 && cur[0] === "")) rows.push(cur);
    cur = [];
  };

  while (i < len) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          // Escaped quote.
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    // Not in quotes.
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      commit();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // \r\n or bare \r
      endRow();
      i += input[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  // Final row (no trailing newline).
  if (cell !== "" || cur.length > 0) endRow();

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return { headers, rows: rows.slice(1) };
}

// ────────── coercion helpers ────────────────────────────────────────────

const TRUE_WORDS = new Set(["true", "1", "yes", "y", "ja", "oui", "да"]);
const FALSE_WORDS = new Set(["false", "0", "no", "n", "nee", "non", "нет"]);

export function coerceBool(raw: string | undefined, fallback = false): boolean {
  if (raw === undefined) return fallback;
  const s = raw.trim().toLowerCase();
  if (s === "") return fallback;
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  // Ambiguous — treat as fallback so a typo doesn't silently flip a flag.
  return fallback;
}

/** "24.90" | "24,90" → "24.90" (string form keeps Decimal precision). */
export function coerceMoney(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null; // reject junk
  return s;
}

export function coerceInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (s === "") return null;
  if (!/^-?\d+$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

export function coerceDate(raw: string | undefined): Date | null | "invalid" {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (s === "") return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d;
}

export function coerceSlugList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Slugifier matches `src/app/admin/products/actions.ts` exactly so CSV
 *  imports and single-product edits produce the same slugs. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

// ────────── row validation ──────────────────────────────────────────────

const STATUS_MAP: Record<string, ProductStatus> = {
  draft: ProductStatus.DRAFT,
  published: ProductStatus.PUBLISHED,
  archived: ProductStatus.ARCHIVED,
  // graceful aliases from common marketplaces
  active: ProductStatus.PUBLISHED,
  live: ProductStatus.PUBLISHED,
  hidden: ProductStatus.ARCHIVED,
};

// Aliases the supplier sheet uses for the gender / age cohort. Mapped
// permissively so a Russian "Унисекс" or French "Mixte" still lands in
// UNISEX. Anything we can't map falls through to UNISEX (the default for
// 90 % of K-beauty products) rather than failing the whole row.
const AUDIENCE_MAP: Record<string, AudienceCategory> = {
  unisex: AudienceCategory.UNISEX,
  mixte: AudienceCategory.UNISEX,
  унисекс: AudienceCategory.UNISEX,
  women: AudienceCategory.WOMEN,
  woman: AudienceCategory.WOMEN,
  female: AudienceCategory.WOMEN,
  "for women": AudienceCategory.WOMEN,
  men: AudienceCategory.MEN,
  man: AudienceCategory.MEN,
  male: AudienceCategory.MEN,
  "for men": AudienceCategory.MEN,
  kids: AudienceCategory.KIDS,
  children: AudienceCategory.KIDS,
  "for boys": AudienceCategory.KIDS,
  "for girls": AudienceCategory.KIDS,
  babies: AudienceCategory.BABIES,
  baby: AudienceCategory.BABIES,
  "for babies": AudienceCategory.BABIES,
};

type LocaleSlot = { locale: Locale; suffix: string };
const LOCALE_SLOTS: ReadonlyArray<LocaleSlot> = [
  { locale: Locale.EN, suffix: "en" },
  { locale: Locale.NL, suffix: "nl" },
  { locale: Locale.FR, suffix: "fr" },
  { locale: Locale.RU, suffix: "ru" },
];

/**
 * Validate a single row. Does not hit the DB — just shape + coercion.
 * Returns either a validated row or a list of field-level error strings.
 */
export function validateRow(
  raw: Record<string, string>,
  rowNumber: number,
): { ok: true; row: ValidatedRow } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  // SKU
  const sku = (raw.sku ?? "").trim();
  if (!sku) errors.push("sku is required");
  if (sku.length > 64) errors.push("sku must be ≤ 64 characters");

  // Status — default to DRAFT when blank so an import won't accidentally
  // flip 50 products live.
  const statusRaw = (raw.status ?? "").trim().toLowerCase();
  const status: ProductStatus = statusRaw
    ? (STATUS_MAP[statusRaw] ?? ProductStatus.DRAFT)
    : ProductStatus.DRAFT;
  if (statusRaw && !STATUS_MAP[statusRaw]) {
    errors.push(
      `status "${raw.status}" unknown — use DRAFT, PUBLISHED, or ARCHIVED`,
    );
  }

  // Brand — blank means "no brand".
  const brandRaw = (raw.brand_slug ?? "").trim();
  const brandSlug = brandRaw === "" ? null : brandRaw;

  // Sub-brand / product line.
  const productLine = trimOrNull(raw.product_line);

  // Barcode — supplier sheets use EAN-13. We accept any digit-only string
  // 8–14 chars (covers UPC-A 12, EAN-8/13, GTIN-14) but normalise to digits
  // only so a stray space/hyphen doesn't break unique-index lookups.
  const barcodeRaw = (raw.barcode ?? "").trim();
  let barcode: string | null = null;
  if (barcodeRaw !== "") {
    const digits = barcodeRaw.replace(/\D+/g, "");
    if (digits.length < 8 || digits.length > 14) {
      errors.push(
        `barcode "${barcodeRaw}" must be a UPC/EAN/GTIN of 8–14 digits`,
      );
    } else {
      barcode = digits;
    }
  }

  // Origin country — accept ISO-3166 alpha-2 (canonical) or full country
  // name (we'll keep alpha-2 in the DB; uppercased). Anything longer than 2
  // chars and not a known name falls through as a soft error.
  const originRaw = (raw.origin_country ?? "").trim();
  let originCountry: string | null = null;
  if (originRaw !== "") {
    if (/^[A-Za-z]{2}$/.test(originRaw)) {
      originCountry = originRaw.toUpperCase();
    } else {
      const mapped = COUNTRY_NAME_TO_ISO[originRaw.toLowerCase()];
      if (mapped) {
        originCountry = mapped;
      } else {
        errors.push(
          `origin_country "${originRaw}" — use the ISO-3166 alpha-2 code (e.g. "KR" for South Korea)`,
        );
      }
    }
  }

  // HS code — light validation: numeric, 6–10 digits typical (we allow up
  // to 14 since some EU subheadings extend that far). Hyphens are stripped.
  const hsRaw = (raw.hs_code ?? "").trim();
  let hsCode: string | null = null;
  if (hsRaw !== "") {
    const digits = hsRaw.replace(/\D+/g, "");
    if (digits.length < 4 || digits.length > 14) {
      errors.push(
        `hs_code "${hsRaw}" must be 4–14 digits (e.g. "3304991000" for skincare)`,
      );
    } else {
      hsCode = digits;
    }
  }

  // Audience — defaults to UNISEX. Unknown strings flag as a soft error so
  // a typo lands on the row's report, not silently drops to UNISEX.
  const audienceRaw = (raw.audience_category ?? "").trim().toLowerCase();
  let audienceCategory: AudienceCategory = AudienceCategory.UNISEX;
  if (audienceRaw !== "") {
    const mapped = AUDIENCE_MAP[audienceRaw];
    if (mapped) {
      audienceCategory = mapped;
    } else {
      errors.push(
        `audience_category "${raw.audience_category}" unknown — use UNISEX, WOMEN, MEN, KIDS, or BABIES`,
      );
    }
  }

  // INCI list — accept anything trimmed. Often very long; no length cap.
  const inciList = trimOrNull(raw.inci_list);

  // Prices.
  const priceEur = coerceMoney(raw.price_eur);
  if (priceEur === null) {
    errors.push("price_eur is required and must look like 24.90");
  }
  const comparePriceEurRaw = raw.compare_price_eur;
  const comparePriceEur =
    comparePriceEurRaw && comparePriceEurRaw.trim() !== ""
      ? coerceMoney(comparePriceEurRaw)
      : null;
  if (comparePriceEurRaw && comparePriceEurRaw.trim() !== "" && comparePriceEur === null) {
    errors.push("compare_price_eur must look like 24.90");
  }
  const costEurRaw = raw.cost_eur;
  const costEur =
    costEurRaw && costEurRaw.trim() !== "" ? coerceMoney(costEurRaw) : null;
  if (costEurRaw && costEurRaw.trim() !== "" && costEur === null) {
    errors.push("cost_eur must look like 24.90");
  }

  // Integers.
  const volumeMl = coerceIntOrError(raw.volume_ml, "volume_ml", errors);
  const weightGrams = coerceIntOrError(
    raw.weight_grams,
    "weight_grams",
    errors,
  );
  const shelfLifeMonths = coerceIntOrError(
    raw.shelf_life_months,
    "shelf_life_months",
    errors,
  );

  // Date.
  const launchedRaw = coerceDate(raw.launched_at);
  if (launchedRaw === "invalid") errors.push("launched_at is not a valid date");
  const launchedAt = launchedRaw === "invalid" ? null : launchedRaw;

  // Booleans (default false).
  const isFeatured = coerceBool(raw.is_featured);
  const isBestseller = coerceBool(raw.is_bestseller);
  const isAvailableForAi = coerceBool(raw.is_available_for_ai, true);
  const hideFromSearch = coerceBool(raw.hide_from_search);

  // Translations — EN required. Others opt-in per locale: we only write a
  // translation row if the caller supplied at least a name for that locale.
  const translations: TranslationFields[] = [];
  for (const slot of LOCALE_SLOTS) {
    const name = (raw[`name_${slot.suffix}`] ?? "").trim();
    if (!name) {
      if (slot.locale === Locale.EN) {
        errors.push("name_en is required");
      }
      continue;
    }
    const description = (raw[`description_${slot.suffix}`] ?? "").trim();
    if (!description && slot.locale === Locale.EN) {
      errors.push("description_en is required");
    }
    const providedSlug = (raw[`slug_${slot.suffix}`] ?? "").trim();
    const slug = providedSlug === "" ? slugify(name) : slugify(providedSlug);
    if (!slug) {
      errors.push(
        `slug_${slot.suffix} could not be derived — give name_${slot.suffix} letters or provide slug_${slot.suffix}`,
      );
      continue;
    }
    translations.push({
      locale: slot.locale,
      name,
      slug,
      shortDescription: trimOrNull(raw[`short_description_${slot.suffix}`]),
      description: description || "<p></p>",
      howToUse: trimOrNull(raw[`how_to_use_${slot.suffix}`]),
      warnings: trimOrNull(raw[`warnings_${slot.suffix}`]),
      seoTitle: trimOrNull(raw[`seo_title_${slot.suffix}`]),
      seoDescription: trimOrNull(raw[`seo_description_${slot.suffix}`]),
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    row: {
      rowNumber,
      sku,
      status,
      brandSlug,
      productLine,
      barcode,
      priceEur: priceEur as string,
      comparePriceEur,
      costEur,
      volumeMl,
      weightGrams,
      shelfLifeMonths,
      originCountry,
      hsCode,
      audienceCategory,
      inciList,
      isFeatured,
      isBestseller,
      isAvailableForAi,
      hideFromSearch,
      launchedAt,
      translations,
      categorySlugs: coerceSlugList(raw.category_slugs),
      ingredientSlugs: coerceSlugList(raw.ingredient_slugs),
      benefitSlugs: coerceSlugList(raw.benefit_slugs),
      skinTypeSlugs: coerceSlugList(raw.skin_type_slugs),
      concernSlugs: coerceSlugList(raw.concern_slugs),
    },
  };
}

// Minimal country-name → ISO-3166-α2 map for the supplier sheets we see.
// an admin almost always sources from Korea; the rest are common K-beauty
// adjacent. Not exhaustive — anything we miss falls through as a row error
// so it gets fixed at upload time rather than landing as bad data.
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  "korea, republic of": "KR",
  "republic of korea": "KR",
  "south korea": "KR",
  "korea": "KR",
  "japan": "JP",
  "china": "CN",
  "france": "FR",
  "germany": "DE",
  "italy": "IT",
  "united kingdom": "GB",
  "united states": "US",
  "usa": "US",
  "netherlands": "NL",
  "belgium": "BE",
};

function coerceIntOrError(
  raw: string | undefined,
  field: string,
  errors: string[],
): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const v = coerceInt(raw);
  if (v === null) {
    errors.push(`${field} must be a whole number`);
    return null;
  }
  if (v <= 0) {
    errors.push(`${field} must be > 0`);
    return null;
  }
  return v;
}

function trimOrNull(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  return s === "" ? null : s;
}

// ────────── full-file parse ─────────────────────────────────────────────

/**
 * Parse an entire CSV file and validate every row. Returns a report ready
 * to hand to the UI. Does not touch the DB — the server-action layer runs
 * this and then resolves FK slugs in a second pass.
 */
export function parseProductCsv(text: string): ParseOutcome {
  const { headers, rows } = tokenizeCsv(text);

  const fileErrors: string[] = [];
  if (headers.length === 0) {
    return {
      fileErrors: ["CSV is empty or has no header row"],
      valid: [],
      invalid: [],
    };
  }

  // Required headers. We allow any missing optional ones and just let the
  // row-level defaults fill them.
  for (const required of ["sku", "name_en", "price_eur"]) {
    if (!headers.includes(required)) {
      fileErrors.push(`Missing required column "${required}"`);
    }
  }

  // Build header → column-index map for O(1) lookup.
  const headerIndex = new Map<string, number>();
  headers.forEach((h, i) => headerIndex.set(h, i));

  const valid: ValidatedRow[] = [];
  const invalid: InvalidRow[] = [];
  const skusSeen = new Map<string, number>(); // sku → first rowNumber

  rows.forEach((cols, idx) => {
    const rowNumber = idx + 1;
    const raw: Record<string, string> = {};
    for (const [h, i] of headerIndex) {
      raw[h] = cols[i] ?? "";
    }

    const result = validateRow(raw, rowNumber);
    if (!result.ok) {
      invalid.push({ rowNumber, raw, errors: result.errors });
      return;
    }

    // Duplicate SKU inside the same file — flag as invalid on the *second*
    // occurrence so the first still imports. (The DB-side upsert would
    // otherwise let the later row silently overwrite the earlier one.)
    const previous = skusSeen.get(result.row.sku);
    if (previous !== undefined) {
      invalid.push({
        rowNumber,
        raw,
        errors: [
          `sku "${result.row.sku}" appears twice — first seen on row ${previous}`,
        ],
      });
      return;
    }
    skusSeen.set(result.row.sku, rowNumber);
    valid.push(result.row);
  });

  return { fileErrors, valid, invalid };
}

// ────────── template generation ─────────────────────────────────────────

const CSV_EXAMPLE: Record<string, string> = {
  sku: "YUR-HYALURON-SERUM",
  status: "DRAFT",
  brand_slug: "yur",
  product_line: "Yu.R PRO",
  barcode: "8809085104847",
  price_eur: "39.00",
  compare_price_eur: "",
  cost_eur: "12.00",
  volume_ml: "30",
  weight_grams: "",
  shelf_life_months: "36",
  origin_country: "KR",
  hs_code: "3304991000",
  audience_category: "UNISEX",
  inci_list:
    "Water, Glycerin, Sodium Hyaluronate, Hydrolyzed Hyaluronic Acid, Panthenol, 1,2-Hexanediol, Allantoin, Ethylhexylglycerin",
  is_featured: "false",
  is_bestseller: "true",
  is_available_for_ai: "true",
  hide_from_search: "false",
  launched_at: "",
  name_en: "Hyaluron Glow Serum",
  slug_en: "hyaluron-glow-serum",
  short_description_en: "Hydrating serum with triple-weight hyaluronic acid.",
  description_en:
    "<p>A lightweight serum that layers three molecular weights of hyaluronic acid for both surface and deep hydration.</p>",
  how_to_use_en:
    "<p>Apply 2–3 drops to damp skin after toning, morning and evening.</p>",
  warnings_en: "Avoid contact with eyes. Discontinue use if irritation occurs.",
  seo_title_en: "Hyaluron Glow Serum — Asian Beauty Shop",
  seo_description_en: "Hydrating hyaluronic serum from Asian Beauty Shop.",
  name_nl: "Hyaluron Glow Serum",
  slug_nl: "hyaluron-glow-serum",
  short_description_nl: "",
  description_nl: "<p>Een licht serum met drie soorten hyaluronzuur.</p>",
  how_to_use_nl: "",
  warnings_nl: "",
  seo_title_nl: "",
  seo_description_nl: "",
  name_fr: "Sérum Hyaluron Glow",
  slug_fr: "serum-hyaluron-glow",
  short_description_fr: "",
  description_fr: "<p>Un sérum léger à trois poids d'acide hyaluronique.</p>",
  how_to_use_fr: "",
  warnings_fr: "",
  seo_title_fr: "",
  seo_description_fr: "",
  name_ru: "Сыворотка с гиалуроновой кислотой",
  slug_ru: "",
  short_description_ru: "",
  description_ru: "<p>Лёгкая сыворотка с тремя видами гиалуроновой кислоты.</p>",
  how_to_use_ru: "",
  warnings_ru: "",
  seo_title_ru: "",
  seo_description_ru: "",
  category_slugs: "serums;hydration",
  ingredient_slugs: "hyaluronic-acid;panthenol",
  benefit_slugs: "hydration;plumping",
  skin_type_slugs: "dry;normal;combination",
  concern_slugs: "dryness;fine-lines",
};

/** Build the downloadable template CSV. */
export function buildTemplateCsv(): string {
  const lines: string[] = [];
  lines.push(CSV_COLUMNS.map(csvCell).join(","));
  lines.push(CSV_COLUMNS.map((c) => csvCell(CSV_EXAMPLE[c] ?? "")).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** RFC-4180 cell escaping, matching the export routes. */
export function csvCell(v: string): string {
  const needsQuoting = /[",\r\n]/.test(v);
  const doubled = v.replace(/"/g, '""');
  return needsQuoting ? `"${doubled}"` : doubled;
}
