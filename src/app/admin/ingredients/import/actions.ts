// ─────────────────────────────────────────────────────────────────────────
// Server actions for /admin/ingredients/import.
//
// Two actions, both take a FormData with the raw CSV in `csv`:
//   · previewIngredientImport — parse + look up which slugs already
//     exist, return wire-friendly preview rows for the UI
//   · commitIngredientImport — re-parse and upsert every valid row
//
// We re-parse on commit instead of trusting the client preview — same
// rule as the product importer. The CSV text is the single source of
// truth from upload through write.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { Locale } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  parseIngredientCsv,
  type ValidatedIngredientRow,
} from "@/lib/admin/ingredient-csv";

// ────────── public result types (JSON-safe) ──────────────────────────────

export type PreviewRowState =
  | { kind: "new" }
  | { kind: "update"; existingId: string }
  | { kind: "error"; errors: string[] };

export type PreviewRow = {
  rowNumber: number;
  slug: string;
  inciName: string;
  displayNameEn: string;
  state: PreviewRowState;
  /** Non-blocking notes (e.g. "translation EN added", "translation FR
   *  removed") — for now we just summarise filled locales. */
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
      failed: { rowNumber: number; slug: string; message: string }[];
    }
  | {
      ok: false;
      message: string;
    };

// ────────── preview ──────────────────────────────────────────────────────

export async function previewIngredientImport(
  _prev: PreviewResult | null,
  formData: FormData,
): Promise<PreviewResult> {
  await requireAdmin();

  const csvText = readCsv(formData);
  if (typeof csvText !== "string") return csvText;

  const outcome = parseIngredientCsv(csvText);

  // Bulk lookup — one query gets the existing IDs for every slug in
  // the CSV. Cheaper than N round-trips.
  const allSlugs = Array.from(new Set(outcome.valid.map((r) => r.slug)));
  const existing = allSlugs.length
    ? await prisma.ingredient.findMany({
        where: { slug: { in: allSlugs } },
        select: { id: true, slug: true },
      })
    : [];
  const existingBySlug = new Map(existing.map((e) => [e.slug, e.id]));

  const rows: PreviewRow[] = [];

  for (const invalid of outcome.invalid) {
    rows.push({
      rowNumber: invalid.rowNumber,
      slug: invalid.raw.slug ?? "",
      inciName: invalid.raw.inci_name ?? "",
      displayNameEn: invalid.raw.display_name_en ?? "",
      state: { kind: "error", errors: Array.from(invalid.errors) },
      warnings: [],
    });
  }

  for (const row of outcome.valid) {
    const filledLocales = row.translations
      .filter((t) => t.displayName.trim().length > 0)
      .map((t) => t.locale)
      .join(", ");
    const filledDescriptions = row.translations.filter(
      (t) => (t.description ?? "").trim().length > 0,
    ).length;
    const warnings: string[] = [];
    if (filledLocales) {
      warnings.push(
        `display name set for ${filledLocales} · descriptions: ${filledDescriptions}/4`,
      );
    } else {
      warnings.push("no display names — will fall back to INCI on the site");
    }

    const existingId = existingBySlug.get(row.slug);
    const state: PreviewRowState = existingId
      ? { kind: "update", existingId }
      : { kind: "new" };

    const en = row.translations.find((t) => t.locale === Locale.EN);

    rows.push({
      rowNumber: row.rowNumber,
      slug: row.slug,
      inciName: row.inciName,
      displayNameEn: en?.displayName ?? "",
      state,
      warnings,
    });
  }

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

export async function commitIngredientImport(
  _prev: CommitResult | null,
  formData: FormData,
): Promise<CommitResult> {
  await requireAdmin();

  const csvText = readCsv(formData);
  if (typeof csvText !== "string") {
    return { ok: false, message: csvText.message };
  }

  const outcome = parseIngredientCsv(csvText);

  if (outcome.fileErrors.length > 0) {
    return {
      ok: false,
      message: `CSV has ${outcome.fileErrors.length} file-level error(s): ${outcome.fileErrors[0]}`,
    };
  }

  let created = 0;
  let updated = 0;
  const failed: { rowNumber: number; slug: string; message: string }[] = [];

  for (const row of outcome.valid) {
    try {
      const existed = await writeRow(row);
      if (existed) updated += 1;
      else created += 1;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "unknown write error";
      failed.push({ rowNumber: row.rowNumber, slug: row.slug, message });
    }
  }

  // Bust caches so the public /ingredients glossary + every PDP
  // ingredient breakdown picks up the new copy on next render.
  revalidatePath("/admin/ingredients");
  revalidatePath("/", "layout");

  return { ok: true, created, updated, failed };
}

// ────────── per-row writer ──────────────────────────────────────────────

/**
 * Upsert one row. Wraps the whole mutation in a transaction so a
 * partial write (Ingredient updated but a translation upsert fails)
 * can't land. Returns true if we updated an existing row.
 */
async function writeRow(row: ValidatedIngredientRow): Promise<boolean> {
  const existing = await prisma.ingredient.findUnique({
    where: { slug: row.slug },
    select: { id: true },
  });
  const existed = existing !== null;

  await prisma.$transaction(async (tx) => {
    const ingredientId = existing
      ? (
          await tx.ingredient.update({
            where: { id: existing.id },
            data: {
              slug: row.slug,
              inciName: row.inciName,
              isKeyAsset: row.isKeyAsset,
              isAllergen: row.isAllergen,
            },
            select: { id: true },
          })
        ).id
      : (
          await tx.ingredient.create({
            data: {
              slug: row.slug,
              inciName: row.inciName,
              isKeyAsset: row.isKeyAsset,
              isAllergen: row.isAllergen,
            },
            select: { id: true },
          })
        ).id;

    // Translations — upsert by (ingredientId, locale). We only WRITE
    // translations for locales where the displayName is non-empty;
    // empty cells mean "leave untouched", not "delete" (so the user
    // can update one locale at a time without losing the others).
    for (const t of row.translations) {
      if (t.displayName.trim().length === 0) continue;
      await tx.ingredientTranslation.upsert({
        where: {
          ingredientId_locale: { ingredientId, locale: t.locale },
        },
        create: {
          ingredientId,
          locale: t.locale,
          displayName: t.displayName,
          description: t.description,
        },
        update: {
          displayName: t.displayName,
          description: t.description,
        },
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
  if (raw.length > 8_000_000) {
    return {
      ok: false,
      message: "CSV is too large (cap is ~8 MB — split into batches).",
    };
  }
  return raw;
}

