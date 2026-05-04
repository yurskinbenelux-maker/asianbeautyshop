// ─────────────────────────────────────────────────────────────────────────
// /admin/ingredients/import/template — download a starter CSV.
//
// Mirrors the products template route. UTF-8 with BOM so Excel-on-Windows
// opens it cleanly. One example row showing the column conventions
// (slug + INCI + 4-locale display names + 4-locale descriptions).
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { buildIngredientTemplateCsv } from "@/lib/admin/ingredient-csv";

export async function GET() {
  await requireAdmin();

  const body = "﻿" + buildIngredientTemplateCsv();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ingredients-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
