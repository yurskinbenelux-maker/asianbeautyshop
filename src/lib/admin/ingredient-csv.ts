// ─────────────────────────────────────────────────────────────────────────
// ingredient-csv.ts — pure CSV parse, validation, and serialisation for
// bulk Ingredient editing.
//
// Same shape as product-csv.ts but smaller. The Ingredient model is
// flat (no taxonomy joins, no media) so the column set is short and a
// row maps 1:1 to one Ingredient + its 4 IngredientTranslation rows.
//
// The intended workflow:
//   1. an admin clicks "Export" on /admin/ingredients → downloads a CSV
//      with one row per ingredient
//   2. She fills missing description copy (or hands the file to an LLM
//      to draft drafts in bulk)
//   3. She clicks "Import" → uploads the same CSV → preview → commit
//
// Slug is the upsert key. Existing slug → update; missing slug → create.
// EN display_name is the fallback for every other locale on the public
// site, so we encourage it but don't strictly require it (an Ingredient
// can render fine using inciName as fallback if EN is blank).
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import {
  coerceBool,
  csvCell,
  slugify,
  tokenizeCsv,
} from "./product-csv";

// ────────── columns ─────────────────────────────────────────────────────

/** Authoritative column list. Adding a column = bump this list and the
 *  row validator. Extra columns on the uploaded CSV are tolerated and
 *  ignored, so an admin can round-trip exports without trimming. */
export const INGREDIENT_CSV_COLUMNS = [
  "slug",
  "inci_name",
  "is_key_asset",
  "is_allergen",
  "display_name_en",
  "display_name_nl",
  "display_name_fr",
  "display_name_ru",
  "description_en",
  "description_nl",
  "description_fr",
  "description_ru",
] as const;

export type IngredientCsvColumn = (typeof INGREDIENT_CSV_COLUMNS)[number];

// ────────── public types ────────────────────────────────────────────────

export type IngredientTranslationRow = {
  locale: Locale;
  /** Empty string if the cell was blank — caller decides whether to
   *  upsert a translation row or skip it. */
  displayName: string;
  /** Null when blank — the public ingredient page renders nothing for
   *  the description block in that case. */
  description: string | null;
};

export type ValidatedIngredientRow = {
  rowNumber: number;
  slug: string;
  inciName: string;
  isKeyAsset: boolean;
  isAllergen: boolean;
  /** Always 4 entries (one per locale), but `displayName` may be empty
   *  for locales the admin hasn't filled. */
  translations: ReadonlyArray<IngredientTranslationRow>;
};

export type InvalidIngredientRow = {
  rowNumber: number;
  raw: Record<string, string>;
  errors: ReadonlyArray<string>;
};

export type IngredientParseOutcome = {
  fileErrors: ReadonlyArray<string>;
  valid: ReadonlyArray<ValidatedIngredientRow>;
  invalid: ReadonlyArray<InvalidIngredientRow>;
};

// Locale slot table — drives both parser column lookup and serialiser
// column ordering. EN first because it's the fallback locale.
type LocaleSlot = { locale: Locale; suffix: string };
const LOCALE_SLOTS: ReadonlyArray<LocaleSlot> = [
  { locale: Locale.EN, suffix: "en" },
  { locale: Locale.NL, suffix: "nl" },
  { locale: Locale.FR, suffix: "fr" },
  { locale: Locale.RU, suffix: "ru" },
];

// ────────── row validation ──────────────────────────────────────────────

/**
 * Validate a single CSV row. No DB access — pure shape coercion.
 */
export function validateIngredientRow(
  raw: Record<string, string>,
  rowNumber: number,
):
  | { ok: true; row: ValidatedIngredientRow }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];

  // Slug — required. Normalise so "Hyaluronic Acid" → "hyaluronic-acid",
  // matching the slug rules the rest of the admin uses.
  const slugRaw = (raw.slug ?? "").trim();
  if (!slugRaw) {
    errors.push("slug is required");
  }
  const slug = slugify(slugRaw);
  if (slugRaw && !slug) {
    errors.push(
      `slug "${slugRaw}" has no usable letters — give it ASCII characters`,
    );
  }
  if (slug && slug.length > 80) {
    // slugify caps at 80 already, but defensive.
    errors.push("slug must be ≤ 80 characters");
  }

  // INCI name — required; this is what the supplier sticker says.
  const inciName = (raw.inci_name ?? "").trim();
  if (!inciName) {
    errors.push("inci_name is required");
  }
  if (inciName.length > 160) {
    errors.push("inci_name must be ≤ 160 characters");
  }

  // Flags default to false. coerceBool tolerates yes/no/ja/oui/да etc.
  const isKeyAsset = coerceBool(raw.is_key_asset);
  const isAllergen = coerceBool(raw.is_allergen);

  // Translations — one slot per locale, may be entirely blank.
  const translations: IngredientTranslationRow[] = [];
  for (const slot of LOCALE_SLOTS) {
    const displayName = (raw[`display_name_${slot.suffix}`] ?? "").trim();
    const descriptionRaw = (raw[`description_${slot.suffix}`] ?? "").trim();
    if (displayName.length > 120) {
      errors.push(
        `display_name_${slot.suffix} must be ≤ 120 characters`,
      );
    }
    if (descriptionRaw.length > 4000) {
      errors.push(
        `description_${slot.suffix} must be ≤ 4000 characters`,
      );
    }
    translations.push({
      locale: slot.locale,
      displayName,
      description: descriptionRaw === "" ? null : descriptionRaw,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    row: {
      rowNumber,
      slug,
      inciName,
      isKeyAsset,
      isAllergen,
      translations,
    },
  };
}

// ────────── full-file parse ─────────────────────────────────────────────

export function parseIngredientCsv(text: string): IngredientParseOutcome {
  const { headers, rows } = tokenizeCsv(text);

  const fileErrors: string[] = [];
  if (headers.length === 0) {
    return {
      fileErrors: ["CSV is empty or has no header row"],
      valid: [],
      invalid: [],
    };
  }

  for (const required of ["slug", "inci_name"]) {
    if (!headers.includes(required)) {
      fileErrors.push(`Missing required column "${required}"`);
    }
  }

  const headerIndex = new Map<string, number>();
  headers.forEach((h, i) => headerIndex.set(h, i));

  const valid: ValidatedIngredientRow[] = [];
  const invalid: InvalidIngredientRow[] = [];
  const slugsSeen = new Map<string, number>(); // slug → first rowNumber

  rows.forEach((cols, idx) => {
    const rowNumber = idx + 1;
    const raw: Record<string, string> = {};
    for (const [h, i] of headerIndex) {
      raw[h] = cols[i] ?? "";
    }

    const result = validateIngredientRow(raw, rowNumber);
    if (!result.ok) {
      invalid.push({ rowNumber, raw, errors: result.errors });
      return;
    }

    // Duplicate slug inside the same file — flag the second occurrence
    // so we don't silently overwrite the first.
    const previous = slugsSeen.get(result.row.slug);
    if (previous !== undefined) {
      invalid.push({
        rowNumber,
        raw,
        errors: [
          `slug "${result.row.slug}" appears twice — first seen on row ${previous}`,
        ],
      });
      return;
    }
    slugsSeen.set(result.row.slug, rowNumber);
    valid.push(result.row);
  });

  return { fileErrors, valid, invalid };
}

// ────────── serialise (for export + template) ──────────────────────────

export type IngredientExportRow = {
  slug: string;
  inciName: string;
  isKeyAsset: boolean;
  isAllergen: boolean;
  translations: Array<{
    locale: Locale;
    displayName: string;
    description: string | null;
  }>;
};

/** Serialise a list of ingredients into a UTF-8 CSV string. The caller
 *  is responsible for prepending a BOM if the target audience is
 *  Excel-on-Windows users.
 *
 *  Translations are flattened into the per-locale columns. Missing
 *  locales (the ingredient has no FR translation row, say) write empty
 *  cells — re-importing won't try to delete the FR row, only fill it. */
export function buildIngredientCsv(rows: IngredientExportRow[]): string {
  const lines: string[] = [];
  lines.push(INGREDIENT_CSV_COLUMNS.map(csvCell).join(","));

  for (const row of rows) {
    const cells: Record<IngredientCsvColumn, string> = {
      slug: row.slug,
      inci_name: row.inciName,
      is_key_asset: row.isKeyAsset ? "true" : "false",
      is_allergen: row.isAllergen ? "true" : "false",
      display_name_en: "",
      display_name_nl: "",
      display_name_fr: "",
      display_name_ru: "",
      description_en: "",
      description_nl: "",
      description_fr: "",
      description_ru: "",
    };
    for (const t of row.translations) {
      const slot = LOCALE_SLOTS.find((s) => s.locale === t.locale);
      if (!slot) continue;
      cells[`display_name_${slot.suffix}` as IngredientCsvColumn] =
        t.displayName ?? "";
      cells[`description_${slot.suffix}` as IngredientCsvColumn] =
        t.description ?? "";
    }
    lines.push(
      INGREDIENT_CSV_COLUMNS.map((c) => csvCell(cells[c] ?? "")).join(","),
    );
  }

  // CRLF line endings to match RFC 4180 + the export format used by
  // Excel/Numbers. Trailing CRLF is conventional.
  return lines.join("\r\n") + "\r\n";
}

const CSV_EXAMPLE: Record<IngredientCsvColumn, string> = {
  slug: "centella-asiatica",
  inci_name: "Centella Asiatica Extract",
  is_key_asset: "true",
  is_allergen: "false",
  display_name_en: "Centella",
  display_name_nl: "Centella",
  display_name_fr: "Centella",
  display_name_ru: "Центелла",
  description_en:
    "<p>A quiet powerhouse for reactive skin — calms, supports the barrier, speeds repair.</p>",
  description_nl:
    "<p>Een rustige krachtpatser voor reactieve huid — kalmeert, ondersteunt de huidbarrière, versnelt herstel.</p>",
  description_fr:
    "<p>Un actif discret pour les peaux réactives — apaise, soutient la barrière cutanée, accélère la réparation.</p>",
  description_ru:
    "<p>Тихий силач для реактивной кожи — успокаивает, поддерживает барьер, ускоряет восстановление.</p>",
};

/** Build the downloadable starter CSV — header row + one example row. */
export function buildIngredientTemplateCsv(): string {
  const lines: string[] = [];
  lines.push(INGREDIENT_CSV_COLUMNS.map(csvCell).join(","));
  lines.push(
    INGREDIENT_CSV_COLUMNS.map((c) => csvCell(CSV_EXAMPLE[c] ?? "")).join(","),
  );
  return lines.join("\r\n") + "\r\n";
}
