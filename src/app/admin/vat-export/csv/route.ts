// ─────────────────────────────────────────────────────────────────────────
// /admin/vat-export — Belgian BTW-aangifte CSV download (G6)
//
// Generates a quarterly VAT report Sofia's accountant can paste into the
// Belgian FPS Finance BTW form. Three blocks in one CSV:
//
//   1. SUMMARY — totals per destination country (gross invoiced + credit
//      notes + net). The accountant fills BTW roosters 03 (BE-domestic
//      21%) and 49 (intra-EU B2C / OSS) from these.
//   2. INVOICES — every invoice issued in the quarter with all the line-
//      level numbers (excl. VAT, VAT, shipping, grand total, rate).
//   3. CREDIT NOTES — every credit note issued in the quarter, referencing
//      the original invoice number. Numbers are positive in the file (the
//      sign is implicit from the document type — Belgian convention).
//
// Quarter math: a Belgian VAT quarter is the calendar quarter, named by
// its end month (Q1 = Jan-Mar). All datetime windows here are
// [yearStart..yearEnd) so a CN issued at 23:59:59 on the last day of the
// quarter is included. The "issuedAt" field on both Invoice and CreditNote
// is the legal-effective date — admin can't edit it post-issue, so the
// report is reproducible across reruns.
//
// Format: RFC 4180-ish CSV with CRLF line endings, UTF-8 + BOM so Excel
// on Windows opens it without mangling. Comment rows are prefixed `#` —
// LibreOffice and Excel both render them as plain rows the accountant
// can leave as-is or delete.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const yearRaw = searchParams.get("year");
  const quarterRaw = searchParams.get("quarter");

  const now = new Date();
  const year = parseIntInRange(yearRaw, 2024, now.getFullYear() + 1) ??
    now.getFullYear();
  const quarter = parseIntInRange(quarterRaw, 1, 4) ??
    Math.floor(now.getMonth() / 3) + 1;

  // Belgian quarter boundaries: Q1 = Jan-Mar (months 0-2),
  // Q2 = Apr-Jun (3-5), Q3 = Jul-Sep (6-8), Q4 = Oct-Dec (9-11).
  const startMonth = (quarter - 1) * 3;
  const periodStart = new Date(year, startMonth, 1, 0, 0, 0, 0);
  const periodEnd = new Date(year, startMonth + 3, 1, 0, 0, 0, 0);

  // Parallel pulls — both indexed on (destinationCountry, issuedAt) so
  // these are sub-millisecond at any realistic shop volume.
  const [invoices, creditNotes] = await Promise.all([
    prisma.invoice.findMany({
      where: { issuedAt: { gte: periodStart, lt: periodEnd } },
      orderBy: { issuedAt: "asc" },
      select: {
        number: true,
        issuedAt: true,
        order: { select: { publicNumber: true } },
        destinationCountry: true,
        subtotalExclVat: true,
        vatTotal: true,
        shippingTotal: true,
        grandTotal: true,
        vatRate: true,
      },
    }),
    prisma.creditNote.findMany({
      where: { issuedAt: { gte: periodStart, lt: periodEnd } },
      orderBy: { issuedAt: "asc" },
      select: {
        number: true,
        issuedAt: true,
        invoice: { select: { number: true } },
        order: { select: { publicNumber: true } },
        return: { select: { publicNumber: true } },
        destinationCountry: true,
        subtotalExclVat: true,
        vatTotal: true,
        shippingTotal: true,
        grandTotal: true,
        vatRate: true,
        reason: true,
      },
    }),
  ]);

  // ── Build summary table by country ────────────────────────────────
  // Two parallel maps so a country with credits but no invoices (rare
  // — would mean refunds for invoices issued in a prior quarter) still
  // surfaces as a row. Net = grossInvoices − grossCredits.
  type SummaryRow = {
    country: string;
    invoiceTotal: number;
    creditTotal: number;
    netTotal: number;
    invoiceVat: number;
    creditVat: number;
    netVat: number;
  };
  const byCountry = new Map<string, SummaryRow>();
  function ensureRow(country: string): SummaryRow {
    let r = byCountry.get(country);
    if (!r) {
      r = {
        country,
        invoiceTotal: 0,
        creditTotal: 0,
        netTotal: 0,
        invoiceVat: 0,
        creditVat: 0,
        netVat: 0,
      };
      byCountry.set(country, r);
    }
    return r;
  }
  for (const inv of invoices) {
    const r = ensureRow(inv.destinationCountry);
    r.invoiceTotal += Number(inv.grandTotal);
    r.invoiceVat += Number(inv.vatTotal);
  }
  for (const cn of creditNotes) {
    const r = ensureRow(cn.destinationCountry);
    r.creditTotal += Number(cn.grandTotal);
    r.creditVat += Number(cn.vatTotal);
  }
  for (const r of byCountry.values()) {
    r.netTotal = round2(r.invoiceTotal - r.creditTotal);
    r.netVat = round2(r.invoiceVat - r.creditVat);
    r.invoiceTotal = round2(r.invoiceTotal);
    r.invoiceVat = round2(r.invoiceVat);
    r.creditTotal = round2(r.creditTotal);
    r.creditVat = round2(r.creditVat);
  }
  const summaryRows = Array.from(byCountry.values()).sort((a, b) =>
    b.netTotal - a.netTotal,
  );

  const totals = summaryRows.reduce(
    (acc, r) => ({
      invoiceTotal: round2(acc.invoiceTotal + r.invoiceTotal),
      invoiceVat: round2(acc.invoiceVat + r.invoiceVat),
      creditTotal: round2(acc.creditTotal + r.creditTotal),
      creditVat: round2(acc.creditVat + r.creditVat),
      netTotal: round2(acc.netTotal + r.netTotal),
      netVat: round2(acc.netVat + r.netVat),
    }),
    {
      invoiceTotal: 0,
      invoiceVat: 0,
      creditTotal: 0,
      creditVat: 0,
      netTotal: 0,
      netVat: 0,
    },
  );

  // ── Compose the CSV ───────────────────────────────────────────────
  const lines: string[] = [];

  // Header / metadata block.
  lines.push(`# Asian Beauty Shop — BTW-aangifte report`);
  lines.push(`# Period: ${year} Q${quarter} (${formatDate(periodStart)} — ${formatDate(addDays(periodEnd, -1))})`);
  lines.push(`# Generated: ${formatDate(now)}`);
  lines.push(`# Issuer: K'Elmus Group BV · BE 1031.312.116 · Aartselaar`);
  lines.push("");

  // Summary block.
  lines.push("# SUMMARY (per destination country)");
  lines.push(
    csvRow([
      "Country",
      "Invoiced (incl. VAT)",
      "Invoiced VAT",
      "Credits issued (incl. VAT)",
      "Credits VAT",
      "Net (incl. VAT)",
      "Net VAT",
    ]),
  );
  for (const r of summaryRows) {
    lines.push(
      csvRow([
        r.country,
        r.invoiceTotal.toFixed(2),
        r.invoiceVat.toFixed(2),
        r.creditTotal.toFixed(2),
        r.creditVat.toFixed(2),
        r.netTotal.toFixed(2),
        r.netVat.toFixed(2),
      ]),
    );
  }
  lines.push(
    csvRow([
      "TOTAL",
      totals.invoiceTotal.toFixed(2),
      totals.invoiceVat.toFixed(2),
      totals.creditTotal.toFixed(2),
      totals.creditVat.toFixed(2),
      totals.netTotal.toFixed(2),
      totals.netVat.toFixed(2),
    ]),
  );
  lines.push("");

  // Detail block — invoices.
  lines.push("# INVOICES");
  lines.push(
    csvRow([
      "Number",
      "Issued",
      "Order",
      "Country",
      "Subtotal excl. VAT",
      "VAT",
      "Shipping (incl. VAT)",
      "Grand total",
      "VAT rate",
    ]),
  );
  for (const inv of invoices) {
    lines.push(
      csvRow([
        inv.number,
        formatDate(inv.issuedAt),
        inv.order.publicNumber,
        inv.destinationCountry,
        Number(inv.subtotalExclVat).toFixed(2),
        Number(inv.vatTotal).toFixed(2),
        Number(inv.shippingTotal).toFixed(2),
        Number(inv.grandTotal).toFixed(2),
        formatPct(Number(inv.vatRate)),
      ]),
    );
  }
  lines.push("");

  // Detail block — credit notes.
  lines.push("# CREDIT NOTES");
  lines.push(
    csvRow([
      "Number",
      "Issued",
      "Refers to invoice",
      "Order",
      "Return",
      "Country",
      "Subtotal excl. VAT",
      "VAT",
      "Grand total",
      "VAT rate",
      "Reason",
    ]),
  );
  for (const cn of creditNotes) {
    lines.push(
      csvRow([
        cn.number,
        formatDate(cn.issuedAt),
        cn.invoice?.number ?? "",
        cn.order.publicNumber,
        cn.return?.publicNumber ?? "",
        cn.destinationCountry,
        Number(cn.subtotalExclVat).toFixed(2),
        Number(cn.vatTotal).toFixed(2),
        Number(cn.grandTotal).toFixed(2),
        formatPct(Number(cn.vatRate)),
        cn.reason,
      ]),
    );
  }
  lines.push("");

  // Footer.
  lines.push(`# End of report — ${invoices.length} invoice(s), ${creditNotes.length} credit note(s)`);

  // UTF-8 BOM so Excel-on-Windows auto-detects the encoding and doesn't
  // mangle Belgian street names like "Boomsesteenweg" or accented
  // customer names. CRLF line endings for the same compatibility reason.
  const csv = "﻿" + lines.join("\r\n");

  const filename = `btw-aangifte-${year}-Q${quarter}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ────────── helpers ──────────────────────────────────────────────────

function parseIntInRange(
  raw: string | null,
  lo: number,
  hi: number,
): number | undefined {
  if (raw == null) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  if (n < lo || n > hi) return undefined;
  return n;
}

function csvRow(cells: string[]): string {
  return cells
    .map((cell) => {
      // Quote any cell that contains a comma, quote, CR or LF — RFC 4180.
      if (/[",\r\n]/.test(cell)) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    })
    .join(",");
}

function formatDate(d: Date): string {
  // ISO-style YYYY-MM-DD — the format Belgian government forms expect.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPct(rate: number): string {
  const pct = rate * 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
