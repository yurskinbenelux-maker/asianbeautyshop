// ─────────────────────────────────────────────────────────────────────────
// /admin/products/export — download the full catalogue as CSV.
//
// Same column set as the importer, populated with current DB state. an
// admin downloads, edits in Excel, re-uploads through /admin/products/import
// to bulk-correct categorisation / pricing / flags without losing the
// hand-tuned multi-language descriptive copy on YU.R products.
//
// UTF-8 with BOM (Excel-on-Windows reads accented characters cleanly),
// Cache-Control: no-store (the catalogue changes; never serve a stale
// snapshot), filename includes today's date so multiple exports archive
// chronologically.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { buildCatalogueCsv } from "@/lib/admin/product-csv-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();

  const csv = await buildCatalogueCsv();
  const body = "﻿" + csv;

  const today = new Date().toISOString().slice(0, 10);
  const filename = `asianbeautyshop-products-${today}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
