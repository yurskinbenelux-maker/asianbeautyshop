// ─────────────────────────────────────────────────────────────────────────
// /admin/products/import/template — download a starter CSV.
//
// Returns a UTF-8 CSV (with BOM so Excel on Windows opens it cleanly)
// containing the full column set and one example row. Sofia can open it
// in Excel/Numbers, fill in her catalogue, and upload back via the import
// form.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { buildTemplateCsv } from "@/lib/admin/product-csv";

export async function GET() {
  await requireAdmin();

  const body = "\uFEFF" + buildTemplateCsv();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="products-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
