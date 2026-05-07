// ─────────────────────────────────────────────────────────────────────────
// Server actions for /admin/products/import.
//
// Two actions, both take a FormData whose `csv` field is the raw file text
// (the client uploads the File, reads it as text, and resubmits through
// these forms). Keeping the canonical source as the original CSV text
// means we re-validate on commit — the client can never hand us a
// fabricated row that skipped validation.
//
//   previewProductImport(csv) — parses, validates, resolves FK slugs,
//     decides NEW vs UPDATE by looking up existing SKUs, and returns a
//     wire-friendly preview for the UI.
//
//   commitProductImport(csv) — re-runs preview and upserts every valid
//     row inside per-row transactions. A failure on one row does not stop
//     the batch; we collect failures and surface them.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { Locale, Prisma, ProductStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  parseProductCsv,
  type ValidatedRow,
} from "@/lib/admin/product-csv";
import {
  ensureIngredients,
  deslugifyToTitle,
} from "@/lib/admin/ingredient-upsert";

// ────────── public result types (JSON-safe) ──────────────────────────────

/** A row as it appears in the preview table. "New"/"Update" is decided
 *  against the current products table; fk_missing is for rows whose slugs
 *  for brand/category/etc. don't exist in the DB yet. */
export type PreviewRowState =
  | { kind: "new" }
  | { kind: "update"; existingId: string }
  | { kind: "error"; errors: string[] };

export type PreviewRow = {
  rowNumber: number;
  sku: string;
  nameEn: string; // summary string for the table
  status: ProductStatus;
  priceEur: string;
  state: PreviewRowState;
  /** Non-blocking warnings (e.g. "brand slug 'foo' not found — will be
   *  cleared on this product"). */
  warnings: string[];
};

export type PreviewResult =
  | {
      ok: true;
      fileErrors: string[];
      rows: PreviewRow[];
      summary: {
        total: number;
        newCount: number;
        updateCount: number;
        errorCount: number;
      };
      /** Re-attached so the client can hand it back to commit(). */
      csvText: string;
    }
  | {
      ok: false;
      message: string;
    };

export type CommitResult =
  | {
      ok: true;
      created: number;
      updated: number;
      failed: { rowNumber: number; sku: string; message: string }[];
    }
  | {
      ok: false;
      message: string;
    };

// ────────── preview ──────────────────────────────────────────────────────

export async function previewProductImport(
  _prev: PreviewResult | null,
  formData: FormData,
): Promise<PreviewResult> {
  await requireAdmin();

  const csvText = readCsv(formData);
  if (typeof csvText !== "string") return csvText; // error tuple

  const outcome = parseProductCsv(csvText);

  // Everything in one read: look up existing SKUs + FK slugs for all
  // referenced brands/categories/etc. in bulk. Cheaper than N lookups per
  // row and keeps the action snappy on a 500-row import.
  const allSkus = Array.from(new Set(outcome.valid.map((r) => r.sku)));
  const allBrandSlugs = unique(
    outcome.valid.map((r) => r.brandSlug).filter(isString),
  );
  const allCategorySlugs = unique(outcome.valid.flatMap((r) => r.categorySlugs));
  const allIngredientSlugs = unique(
    outcome.valid.flatMap((r) => r.ingredientSlugs),
  );
  const allBenefitSlugs = unique(outcome.valid.flatMap((r) => r.benefitSlugs));
  const allSkinTypeSlugs = unique(
    outcome.valid.flatMap((r) => r.skinTypeSlugs),
  );
  const allConcernSlugs = unique(outcome.valid.flatMap((r) => r.concernSlugs));

  const [
    existingProducts,
    brands,
    categories,
    ingredients,
    benefits,
    skinTypes,
    concerns,
  ] = await Promise.all([
    allSkus.length
      ? prisma.product.findMany({
          where: { sku: { in: allSkus }, deletedAt: null },
          select: { id: true, sku: true },
        })
      : Promise.resolve([]),
    allBrandSlugs.length
      ? prisma.brand.findMany({
          where: { slug: { in: allBrandSlugs } },
          select: { slug: true },
        })
      : Promise.resolve([]),
    allCategorySlugs.length
      ? prisma.category.findMany({
          where: { slug: { in: allCategorySlugs } },
          select: { slug: true },
        })
      : Promise.resolve([]),
    allIngredientSlugs.length
      ? prisma.ingredient.findMany({
          where: { slug: { in: allIngredientSlugs } },
          select: { slug: true },
        })
      : Promise.resolve([]),
    allBenefitSlugs.length
      ? prisma.benefit.findMany({
          where: { slug: { in: allBenefitSlugs } },
          select: { slug: true },
        })
      : Promise.resolve([]),
    allSkinTypeSlugs.length
      ? prisma.skinType.findMany({
          where: { slug: { in: allSkinTypeSlugs } },
          select: { slug: true },
        })
      : Promise.resolve([]),
    allConcernSlugs.length
      ? prisma.concern.findMany({
          where: { slug: { in: allConcernSlugs } },
          select: { slug: true },
        })
      : Promise.resolve([]),
  ]);

  const existingBySku = new Map(existingProducts.map((p) => [p.sku, p.id]));
  const brandSet = new Set(brands.map((b) => b.slug));
  const categorySet = new Set(categories.map((c) => c.slug));
  const ingredientSet = new Set(ingredients.map((i) => i.slug));
  const benefitSet = new Set(benefits.map((b) => b.slug));
  const skinTypeSet = new Set(skinTypes.map((s) => s.slug));
  const concernSet = new Set(concerns.map((c) => c.slug));

  const rows: PreviewRow[] = [];

  for (const invalid of outcome.invalid) {
    rows.push({
      rowNumber: invalid.rowNumber,
      sku: invalid.raw.sku ?? "",
      nameEn: invalid.raw.name_en ?? "",
      status: ProductStatus.DRAFT,
      priceEur: invalid.raw.price_eur ?? "",
      state: { kind: "error", errors: Array.from(invalid.errors) },
      warnings: [],
    });
  }

  for (const row of outcome.valid) {
    const warnings: string[] = [];
    if (row.brandSlug && !brandSet.has(row.brandSlug)) {
      warnings.push(
        `brand "${row.brandSlug}" not found — will be left unset`,
      );
    }
    const missingCats = row.categorySlugs.filter(
      (s) => !categorySet.has(s),
    );
    if (missingCats.length) {
      warnings.push(
        `categories not found: ${missingCats.join(", ")} — will be skipped`,
      );
    }
    const missingIngs = row.ingredientSlugs.filter(
      (s) => !ingredientSet.has(s),
    );
    if (missingIngs.length) {
      // Unlike the other taxonomy types we DO auto-create missing
      // ingredients on commit (so the master library grows organically
      // when an admin imports a new K-beauty supplier sheet). Surface this
      // as an info-style warning so she knows what's about to happen.
      warnings.push(
        `ingredients will be auto-created in the master library: ${missingIngs.join(", ")}`,
      );
    }
    const missingBens = row.benefitSlugs.filter((s) => !benefitSet.has(s));
    if (missingBens.length) {
      warnings.push(
        `benefits not found: ${missingBens.join(", ")} — will be skipped`,
      );
    }
    const missingSkinTypes = row.skinTypeSlugs.filter(
      (s) => !skinTypeSet.has(s),
    );
    if (missingSkinTypes.length) {
      warnings.push(
        `skin types not found: ${missingSkinTypes.join(", ")} — will be skipped`,
      );
    }
    const missingConcerns = row.concernSlugs.filter(
      (s) => !concernSet.has(s),
    );
    if (missingConcerns.length) {
      warnings.push(
        `concerns not found: ${missingConcerns.join(", ")} — will be skipped`,
      );
    }

    const existingId = existingBySku.get(row.sku);
    const state: PreviewRowState = existingId
      ? { kind: "update", existingId }
      : { kind: "new" };

    rows.push({
      rowNumber: row.rowNumber,
      sku: row.sku,
      nameEn:
        row.translations.find((t) => t.locale === Locale.EN)?.name ?? "",
      status: row.status,
      priceEur: row.priceEur,
      state,
      warnings,
    });
  }

  // Keep table order predictable — by the CSV row number.
  rows.sort((a, b) => a.rowNumber - b.rowNumber);

  const newCount = rows.filter((r) => r.state.kind === "new").length;
  const updateCount = rows.filter((r) => r.state.kind === "update").length;
  const errorCount = rows.filter((r) => r.state.kind === "error").length;

  return {
    ok: true,
    fileErrors: Array.from(outcome.fileErrors),
    rows,
    summary: {
      total: rows.length,
      newCount,
      updateCount,
      errorCount,
    },
    csvText,
  };
}

// ────────── commit ───────────────────────────────────────────────────────

export async function commitProductImport(
  _prev: CommitResult | null,
  formData: FormData,
): Promise<CommitResult> {
  await requireAdmin();

  const csvText = readCsv(formData);
  if (typeof csvText !== "string") {
    return { ok: false, message: csvText.message };
  }

  // Re-parse from source — we never trust client-supplied rows.
  const outcome = parseProductCsv(csvText);

  if (outcome.fileErrors.length > 0) {
    return {
      ok: false,
      message: `CSV has ${outcome.fileErrors.length} file-level error(s): ${outcome.fileErrors[0]}`,
    };
  }

  // Pre-fetch lookup maps once — saves round-trips inside the per-row loop.
  const allBrandSlugs = unique(
    outcome.valid.map((r) => r.brandSlug).filter(isString),
  );
  const allCategorySlugs = unique(outcome.valid.flatMap((r) => r.categorySlugs));
  const allIngredientSlugs = unique(
    outcome.valid.flatMap((r) => r.ingredientSlugs),
  );
  const allBenefitSlugs = unique(outcome.valid.flatMap((r) => r.benefitSlugs));
  const allSkinTypeSlugs = unique(
    outcome.valid.flatMap((r) => r.skinTypeSlugs),
  );
  const allConcernSlugs = unique(outcome.valid.flatMap((r) => r.concernSlugs));

  const [
    brands,
    categories,
    ingredients,
    benefits,
    skinTypes,
    concerns,
  ] = await Promise.all([
    prisma.brand.findMany({
      where: { slug: { in: allBrandSlugs } },
      select: { id: true, slug: true },
    }),
    prisma.category.findMany({
      where: { slug: { in: allCategorySlugs } },
      select: { id: true, slug: true },
    }),
    prisma.ingredient.findMany({
      where: { slug: { in: allIngredientSlugs } },
      select: { id: true, slug: true },
    }),
    prisma.benefit.findMany({
      where: { slug: { in: allBenefitSlugs } },
      select: { id: true, slug: true },
    }),
    prisma.skinType.findMany({
      where: { slug: { in: allSkinTypeSlugs } },
      select: { id: true, slug: true },
    }),
    prisma.concern.findMany({
      where: { slug: { in: allConcernSlugs } },
      select: { id: true, slug: true },
    }),
  ]);

  const brandIdBySlug = new Map(brands.map((b) => [b.slug, b.id]));
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const ingredientIdBySlug = new Map(ingredients.map((i) => [i.slug, i.id]));
  const benefitIdBySlug = new Map(benefits.map((b) => [b.slug, b.id]));
  const skinTypeIdBySlug = new Map(skinTypes.map((s) => [s.slug, s.id]));
  const concernIdBySlug = new Map(concerns.map((c) => [c.slug, c.id]));

  // Auto-grow the master Ingredient library. Any slug from the CSV that
  // doesn't exist yet gets a stub Ingredient + EN translation row so the
  // ProductIngredient links land properly. an admin can refine the
  // displayName / description / extra locales from /admin/ingredients
  // afterwards. We only do this for ingredients (not the other
  // taxonomies) because INCI lists arrive in bulk from supplier sheets,
  // whereas categories / benefits / skin types / concerns are a small
  // curated set an admin maintains by hand.
  const missingIngredientSlugs = allIngredientSlugs.filter(
    (s) => !ingredientIdBySlug.has(s),
  );
  if (missingIngredientSlugs.length > 0) {
    const upserted = await ensureIngredients(
      missingIngredientSlugs.map((slug) => ({
        slug,
        inciName: deslugifyToTitle(slug),
      })),
    );
    for (const [slug, id] of upserted) {
      ingredientIdBySlug.set(slug, id);
    }
  }

  let created = 0;
  let updated = 0;
  const failed: { rowNumber: number; sku: string; message: string }[] = [];

  for (const row of outcome.valid) {
    try {
      const existed = await writeRow(row, {
        brandIdBySlug,
        categoryIdBySlug,
        ingredientIdBySlug,
        benefitIdBySlug,
        skinTypeIdBySlug,
        concernIdBySlug,
      });
      if (existed) updated += 1;
      else created += 1;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "unknown write error";
      failed.push({ rowNumber: row.rowNumber, sku: row.sku, message });
    }
  }

  // Bust caches so /shop picks up the new catalogue immediately.
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/");

  return { ok: true, created, updated, failed };
}

// ────────── per-row writer ──────────────────────────────────────────────

type LookupMaps = {
  brandIdBySlug: Map<string, string>;
  categoryIdBySlug: Map<string, string>;
  ingredientIdBySlug: Map<string, string>;
  benefitIdBySlug: Map<string, string>;
  skinTypeIdBySlug: Map<string, string>;
  concernIdBySlug: Map<string, string>;
};

/**
 * Upsert one row. Wraps the whole mutation in a transaction so partial
 * writes can't land (e.g. Product updated but pivot replacement fails).
 * Returns true if we updated an existing product, false if we created.
 */
async function writeRow(
  row: ValidatedRow,
  maps: LookupMaps,
): Promise<boolean> {
  const brandId = row.brandSlug ? maps.brandIdBySlug.get(row.brandSlug) : null;

  // Silently drop FK slugs that didn't resolve — the preview already
  // surfaced these as warnings, so this is expected behaviour.
  const categoryIds = row.categorySlugs
    .map((s) => maps.categoryIdBySlug.get(s))
    .filter(isString);
  const ingredientIds = row.ingredientSlugs
    .map((s) => maps.ingredientIdBySlug.get(s))
    .filter(isString);
  const benefitIds = row.benefitSlugs
    .map((s) => maps.benefitIdBySlug.get(s))
    .filter(isString);
  const skinTypeIds = row.skinTypeSlugs
    .map((s) => maps.skinTypeIdBySlug.get(s))
    .filter(isString);
  const concernIds = row.concernSlugs
    .map((s) => maps.concernIdBySlug.get(s))
    .filter(isString);

  const existing = await prisma.product.findUnique({
    where: { sku: row.sku },
    select: { id: true, deletedAt: true },
  });
  const existed = existing !== null && existing.deletedAt === null;

  const priceDecimal = new Prisma.Decimal(row.priceEur);
  const comparePriceDecimal =
    row.comparePriceEur !== null ? new Prisma.Decimal(row.comparePriceEur) : null;
  const costDecimal =
    row.costEur !== null ? new Prisma.Decimal(row.costEur) : null;

  await prisma.$transaction(async (tx) => {
    const productId =
      existing?.id ??
      (
        await tx.product.create({
          data: {
            sku: row.sku,
            status: row.status,
            brandId: brandId ?? null,
            productLine: row.productLine,
            barcode: row.barcode,
            price: priceDecimal,
            comparePrice: comparePriceDecimal,
            cost: costDecimal,
            volumeMl: row.volumeMl,
            weightGrams: row.weightGrams,
            shelfLifeMonths: row.shelfLifeMonths,
            originCountry: row.originCountry,
            hsCode: row.hsCode,
            audienceCategory: row.audienceCategory,
            inciList: row.inciList,
            isFeatured: row.isFeatured,
            isBestseller: row.isBestseller,
            isAvailableForAi: row.isAvailableForAi,
            hideFromSearch: row.hideFromSearch,
            launchedAt: row.launchedAt,
          },
          select: { id: true },
        })
      ).id;

    if (existing) {
      await tx.product.update({
        where: { id: productId },
        data: {
          status: row.status,
          brandId: brandId ?? null,
          productLine: row.productLine,
          barcode: row.barcode,
          price: priceDecimal,
          comparePrice: comparePriceDecimal,
          cost: costDecimal,
          volumeMl: row.volumeMl,
          weightGrams: row.weightGrams,
          shelfLifeMonths: row.shelfLifeMonths,
          originCountry: row.originCountry,
          hsCode: row.hsCode,
          audienceCategory: row.audienceCategory,
          inciList: row.inciList,
          isFeatured: row.isFeatured,
          isBestseller: row.isBestseller,
          isAvailableForAi: row.isAvailableForAi,
          hideFromSearch: row.hideFromSearch,
          launchedAt: row.launchedAt,
          // If an admin had soft-deleted the SKU, a fresh import revives it.
          deletedAt: null,
        },
      });
    }

    // Translations — upsert by (productId, locale). Omit untouched locales
    // so an admin who only maintains EN + NL in the CSV doesn't wipe a
    // hand-edited FR translation from the single-product editor.
    for (const t of row.translations) {
      await tx.productTranslation.upsert({
        where: { productId_locale: { productId, locale: t.locale } },
        create: {
          productId,
          locale: t.locale,
          name: t.name,
          slug: t.slug,
          shortDescription: t.shortDescription,
          description: t.description,
          howToUse: t.howToUse,
          warnings: t.warnings,
          seoTitle: t.seoTitle,
          seoDescription: t.seoDescription,
        },
        update: {
          name: t.name,
          slug: t.slug,
          shortDescription: t.shortDescription,
          description: t.description,
          howToUse: t.howToUse,
          warnings: t.warnings,
          seoTitle: t.seoTitle,
          seoDescription: t.seoDescription,
        },
      });
    }

    // Pivots — replace the set on each import. This is the least-surprising
    // behaviour: the CSV is the source of truth for taxonomy mappings, and
    // an admin who wants to add one-off pivots should do so in the single-
    // product editor after the import (or add them to the CSV).
    await tx.productCategory.deleteMany({ where: { productId } });
    await tx.productIngredient.deleteMany({ where: { productId } });
    await tx.productBenefit.deleteMany({ where: { productId } });
    await tx.productSkinType.deleteMany({ where: { productId } });
    await tx.productConcern.deleteMany({ where: { productId } });

    if (categoryIds.length) {
      await tx.productCategory.createMany({
        data: categoryIds.map((categoryId) => ({ productId, categoryId })),
      });
    }
    if (ingredientIds.length) {
      await tx.productIngredient.createMany({
        data: ingredientIds.map((ingredientId) => ({ productId, ingredientId })),
      });
    }
    if (benefitIds.length) {
      await tx.productBenefit.createMany({
        data: benefitIds.map((benefitId, idx) => ({
          productId,
          benefitId,
          sortOrder: idx,
        })),
      });
    }
    if (skinTypeIds.length) {
      await tx.productSkinType.createMany({
        data: skinTypeIds.map((skinTypeId) => ({ productId, skinTypeId })),
      });
    }
    if (concernIds.length) {
      await tx.productConcern.createMany({
        data: concernIds.map((concernId) => ({ productId, concernId })),
      });
    }
  });

  return existed;
}

// ────────── tiny helpers ────────────────────────────────────────────────

function readCsv(
  formData: FormData,
): string | { ok: false; message: string } {
  const raw = formData.get("csv");
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, message: "No CSV text was submitted." };
  }
  // Rough sanity cap — ~8 MB of CSV is easily enough for the whole Asian Beauty Shop
  // catalogue. Prevents a rogue upload from pushing the action over the
  // Next.js 4 MB body limit (we'd get a 413 before reaching here, but the
  // belt-and-braces is nice).
  if (raw.length > 8_000_000) {
    return {
      ok: false,
      message: "CSV is too large (cap is ~8 MB — split into batches).",
    };
  }
  return raw;
}

function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
function isString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}
