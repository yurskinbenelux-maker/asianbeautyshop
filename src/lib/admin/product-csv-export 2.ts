// ─────────────────────────────────────────────────────────────────────────
// product-csv-export.ts — read current product catalogue + emit a CSV that
// round-trips perfectly through the importer at /admin/products/import.
//
// Why this is a separate file from product-csv.ts: that file is pure (no
// Prisma, no IO) so the parser stays unit-testable in isolation. The
// exporter inherently needs DB access, so we keep it next door instead.
//
// Round-trip contract:
//   1. Export this file for every non-deleted product
//   2. Re-import the unmodified CSV through the existing flow
//   3. Preview should show "update" rows but every field should match —
//      the only DB churn is rewriting identical values.
//
// Out of scope (matches importer):
//   • Product images — managed via Media Library / per-product editor
//   • ProductVariant rows — multi-size/multi-shade SKUs are edited in
//     the per-product editor; the CSV only round-trips the parent product
//   • A handful of newer fields not in CSV_COLUMNS (e.g. is_new,
//     family_slug, sale_price) — these stay untouched on re-import,
//     which is the safe default.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { CSV_COLUMNS, csvCell } from "./product-csv";

/** Format an integer-or-null cell. Empty string for null. */
function intCell(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

/**
 * Format a Prisma.Decimal (or string) cell as "39.00" — two decimal places
 * for money so Excel doesn't reformat into scientific notation, matches the
 * importer's expected shape.
 */
function priceCell(v: { toString(): string } | null | undefined): string {
  if (v == null) return "";
  // Prisma.Decimal#toString returns "39", "39.5", "39.50" depending on the
  // stored precision. Normalise to two-decimals because that's the shape an
  // admin reads as "EUR price".
  const n = Number(v.toString());
  if (!Number.isFinite(n)) return v.toString();
  return n.toFixed(2);
}

/** ISO-date for date columns ("2025-04-23"). Empty for null. */
function dateCell(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/** Lowercase "true" / "false" so the importer's boolean coercion accepts it. */
function boolCell(b: boolean | null | undefined): string {
  return b ? "true" : "false";
}

/** Semicolon-joined slug list — the importer's expected pivot shape. */
function slugListCell(slugs: ReadonlyArray<string>): string {
  return slugs.join(";");
}

// ────────── data fetch ─────────────────────────────────────────────────

/**
 * Fetch every non-deleted product with the relations we need for a clean
 * CSV round-trip. Ordered by SKU so the file is diff-friendly across
 * exports — easy to spot what changed if an admin runs two exports a
 * week apart.
 */
async function fetchAllProductsForExport() {
  return prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: { sku: "asc" },
    include: {
      brand: { select: { slug: true } },
      translations: true,
      categories: {
        include: { category: { select: { slug: true } } },
      },
      ingredients: {
        include: { ingredient: { select: { slug: true } } },
      },
      benefits: {
        orderBy: { sortOrder: "asc" },
        include: { benefit: { select: { slug: true } } },
      },
      skinTypes: {
        include: { skinType: { select: { slug: true } } },
      },
      concerns: {
        include: { concern: { select: { slug: true } } },
      },
    },
  });
}

// ────────── CSV emission ──────────────────────────────────────────────

type ProductRow = Awaited<ReturnType<typeof fetchAllProductsForExport>>[number];

/**
 * Build a CSV row keyed by column name. Returned as Record<string,string>
 * so we can later hand it to CSV_COLUMNS.map(col => row[col]) and emit
 * exactly the column order the importer expects.
 */
function rowFor(p: ProductRow): Record<string, string> {
  // Index translations by locale so we can fill all four columns sets even
  // when the product is missing a locale (cell stays empty).
  const tx = new Map(p.translations.map((t) => [t.locale, t]));
  const en = tx.get(Locale.EN);
  const nl = tx.get(Locale.NL);
  const fr = tx.get(Locale.FR);
  const ru = tx.get(Locale.RU);

  return {
    // identity / status
    sku: p.sku,
    status: p.status,
    brand_slug: p.brand?.slug ?? "",
    product_line: p.productLine ?? "",
    barcode: p.barcode ?? "",

    // pricing
    price_eur: priceCell(p.price),
    compare_price_eur: priceCell(p.comparePrice),
    cost_eur: priceCell(p.cost),

    // physical
    volume_ml: intCell(p.volumeMl),
    weight_grams: intCell(p.weightGrams),
    shelf_life_months: intCell(p.shelfLifeMonths),
    origin_country: p.originCountry ?? "",
    hs_code: p.hsCode ?? "",
    audience_category: p.audienceCategory,
    inci_list: p.inciList ?? "",

    // flags
    is_featured: boolCell(p.isFeatured),
    is_bestseller: boolCell(p.isBestseller),
    is_available_for_ai: boolCell(p.isAvailableForAi),
    hide_from_search: boolCell(p.hideFromSearch),

    // dates
    launched_at: dateCell(p.launchedAt),

    // EN
    name_en: en?.name ?? "",
    slug_en: en?.slug ?? "",
    short_description_en: en?.shortDescription ?? "",
    description_en: en?.description ?? "",
    how_to_use_en: en?.howToUse ?? "",
    warnings_en: en?.warnings ?? "",
    seo_title_en: en?.seoTitle ?? "",
    seo_description_en: en?.seoDescription ?? "",

    // NL
    name_nl: nl?.name ?? "",
    slug_nl: nl?.slug ?? "",
    short_description_nl: nl?.shortDescription ?? "",
    description_nl: nl?.description ?? "",
    how_to_use_nl: nl?.howToUse ?? "",
    warnings_nl: nl?.warnings ?? "",
    seo_title_nl: nl?.seoTitle ?? "",
    seo_description_nl: nl?.seoDescription ?? "",

    // FR
    name_fr: fr?.name ?? "",
    slug_fr: fr?.slug ?? "",
    short_description_fr: fr?.shortDescription ?? "",
    description_fr: fr?.description ?? "",
    how_to_use_fr: fr?.howToUse ?? "",
    warnings_fr: fr?.warnings ?? "",
    seo_title_fr: fr?.seoTitle ?? "",
    seo_description_fr: fr?.seoDescription ?? "",

    // RU
    name_ru: ru?.name ?? "",
    slug_ru: ru?.slug ?? "",
    short_description_ru: ru?.shortDescription ?? "",
    description_ru: ru?.description ?? "",
    how_to_use_ru: ru?.howToUse ?? "",
    warnings_ru: ru?.warnings ?? "",
    seo_title_ru: ru?.seoTitle ?? "",
    seo_description_ru: ru?.seoDescription ?? "",

    // pivots — joined with ";" (the importer's expected separator)
    category_slugs: slugListCell(p.categories.map((c) => c.category.slug)),
    ingredient_slugs: slugListCell(p.ingredients.map((i) => i.ingredient.slug)),
    benefit_slugs: slugListCell(p.benefits.map((b) => b.benefit.slug)),
    skin_type_slugs: slugListCell(p.skinTypes.map((s) => s.skinType.slug)),
    concern_slugs: slugListCell(p.concerns.map((c) => c.concern.slug)),
  };
}

/**
 * Build the full catalogue CSV string. Caller is expected to wrap the
 * result with the UTF-8 BOM and the right Content-Disposition headers
 * before returning to the browser.
 */
export async function buildCatalogueCsv(): Promise<string> {
  const products = await fetchAllProductsForExport();

  const lines: string[] = [];
  // Header
  lines.push(CSV_COLUMNS.map((c) => csvCell(c)).join(","));
  // Rows
  for (const p of products) {
    const row = rowFor(p);
    lines.push(CSV_COLUMNS.map((c) => csvCell(row[c] ?? "")).join(","));
  }
  // CRLF line endings + trailing newline (RFC 4180)
  return lines.join("\r\n") + "\r\n";
}
