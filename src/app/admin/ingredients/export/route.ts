// ─────────────────────────────────────────────────────────────────────────
// /admin/ingredients/export — download the entire Ingredient library as CSV.
//
// an admin's main use case: take a snapshot of every ingredient (often with
// half the descriptions blank), feed the file to an LLM to draft the
// missing descriptions in bulk, then re-import via /admin/ingredients/import.
//
// Sort order is alphabetical by slug — gives a deterministic file so a
// re-export after edits produces a clean diff in version control or a
// spreadsheet.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { Locale } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  buildIngredientCsv,
  type IngredientExportRow,
} from "@/lib/admin/ingredient-csv";

export async function GET() {
  await requireAdmin();

  // One read pulls everything we need. Even a generous K-beauty catalogue
  // sits well under 1,000 ingredients — no need to paginate.
  const ingredients = await prisma.ingredient.findMany({
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      inciName: true,
      isKeyAsset: true,
      isAllergen: true,
      translations: {
        select: {
          locale: true,
          displayName: true,
          description: true,
        },
      },
    },
  });

  const rows: IngredientExportRow[] = ingredients.map((i) => ({
    slug: i.slug,
    inciName: i.inciName,
    isKeyAsset: i.isKeyAsset,
    isAllergen: i.isAllergen,
    translations: i.translations.map((t) => ({
      locale: t.locale as Locale,
      displayName: t.displayName,
      description: t.description ?? null,
    })),
  }));

  // BOM prepend for Excel-on-Windows. Filename includes today's date so
  // re-exports don't overwrite each other in the Downloads folder.
  const today = new Date().toISOString().slice(0, 10);
  const body = "﻿" + buildIngredientCsv(rows);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ingredients-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
