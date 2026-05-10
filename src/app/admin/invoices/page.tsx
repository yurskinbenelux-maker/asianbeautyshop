// ─────────────────────────────────────────────────────────────────────────
// /admin/invoices — listing of every issued VAT invoice + credit note.
//
// An admin opens this page for two reasons:
//   1. Quarterly bookkeeping — narrow to a quarter and hand a ZIP of
//      PDFs to the accountant for the BTW-aangifte.
//   2. Re-send a specific invoice or credit note to a customer.
//
// G13 (this revision):
//   · Quarter picker at the top — filters BOTH the invoices table and
//     the credit notes table to the selected Belgian fiscal quarter.
//     "All time" resets to the legacy latest-200 view.
//   · Two "Download ZIP" buttons, one per type, that stream all PDFs
//     in the current period. "What you see is what you get."
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Download, ExternalLink, FileArchive, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { DeleteInvoice } from "@/components/admin/invoices/delete-invoice";
import { QuarterPicker } from "@/components/admin/invoices/quarter-picker";
import {
  parseQuarterParams,
  quarterLabel,
  quarterWindow,
} from "@/lib/utils/quarter";

const EUR = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const DATE_FMT = new Intl.DateTimeFormat("en-IE", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const COUNTRY_FLAG: Record<string, string> = {
  BE: "Belgium",
  NL: "Netherlands",
  FR: "France",
  LU: "Luxembourg",
  DE: "Germany",
};

const CN_REASON_LABEL: Record<string, string> = {
  RETURN: "Return",
  CANCELLATION: "Cancellation",
  PRICE_ADJUSTMENT: "Price adj.",
  GOODWILL: "Goodwill",
  DUPLICATE: "Duplicate",
};
const CN_REASON_TINT: Record<string, string> = {
  RETURN: "border-vermilion/30 bg-vermilion/5 text-vermilion",
  CANCELLATION: "border-ink/20 bg-ink/5 text-ink",
  PRICE_ADJUSTMENT: "border-ink/20 bg-ink/5 text-ink",
  GOODWILL: "border-sage/40 bg-sage/10 text-ink",
  DUPLICATE: "border-ink/20 bg-ink/5 text-ink-mid",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ year?: string; quarter?: string }>;
};

export default async function AdminInvoicesPage({ searchParams }: Props) {
  await requireAdmin();
  const { year, quarter } = await searchParams;

  const scope = parseQuarterParams(year, quarter);
  const window = quarterWindow(scope);

  // Period-aware where-clause. When scope is "all" we keep the original
  // "latest 200" behaviour (no period filter, no take cap difference).
  // Once admin picks a quarter we drop the take cap entirely — a single
  // quarter is realistically dozens of rows, not hundreds.
  const periodWhere = window
    ? { issuedAt: { gte: window.periodStart, lt: window.periodEnd } }
    : undefined;

  const invoices = await prisma.invoice.findMany({
    where: periodWhere,
    orderBy: { issuedAt: "desc" },
    take: window ? undefined : 200,
    include: {
      order: {
        select: {
          publicNumber: true,
          email: true,
          shippingAddress: {
            select: { firstName: true, lastName: true },
          },
        },
      },
    },
  });

  const creditNotes = await prisma.creditNote.findMany({
    where: periodWhere,
    orderBy: { issuedAt: "desc" },
    take: window ? undefined : 200,
    include: {
      invoice: { select: { id: true, number: true } },
      order: { select: { id: true, publicNumber: true } },
      return: { select: { id: true, publicNumber: true } },
    },
  });

  // Pre-build the QS that the Download ZIP buttons need so they ALWAYS
  // export exactly what's on screen. When admin is on "all time", the
  // ZIP routes interpret the empty params as their own "all time"
  // (capped at 500 — see /admin/invoices/zip route).
  const zipQs = new URLSearchParams();
  if (scope.kind !== "all") {
    zipQs.set("year", String(scope.year));
    zipQs.set("quarter", scope.kind === "quarter" ? String(scope.quarter) : "full");
  }
  const zipQsString = zipQs.toString();
  const invoicesZipHref = zipQsString
    ? `/admin/invoices/zip?${zipQsString}`
    : "/admin/invoices/zip";
  const creditNotesZipHref = zipQsString
    ? `/admin/credit-notes/zip?${zipQsString}`
    : "/admin/credit-notes/zip";

  // Derive the QuarterPicker's initial values from the parsed scope so
  // the picker reflects the URL on first paint (no flicker / state
  // mismatch between SSR and the first hydration).
  const initialYear = scope.kind === "all" ? null : scope.year;
  const initialPeriod =
    scope.kind === "all"
      ? "all"
      : scope.kind === "year"
        ? "full"
        : (String(scope.quarter) as "1" | "2" | "3" | "4");

  const periodLabel = quarterLabel(scope);

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Admin · Bookkeeping</div>
          <h1 className="mt-2 font-display text-[38px] leading-tight text-ink">
            Invoices
          </h1>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink-mid">
            Every paid order generates a sequential VAT invoice (Belgian
            Royal Decree no. 1, art. 5). Stored 10 years per Belgian Code
            de droit économique III.86 — this is your bookkeeping pile.
          </p>
        </div>
        <QuarterPicker
          initialYear={initialYear}
          initialPeriod={initialPeriod}
        />
      </header>

      {/* Retention banner — explains the legal floor and the only
       *  legitimate scenarios for deletion. */}
      <div className="mb-8 flex items-start gap-3 border border-vermilion/30 bg-vermilion/5 p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-vermilion" aria-hidden />
        <div className="text-[12px] leading-relaxed text-ink">
          <strong className="text-ink">Belgian retention rules apply.</strong>{" "}
          Issued invoices must be kept for 10 years (Code de droit
          économique III.86) and 7 years for the VAT-side (Code TVA Art.
          60). Use the per-row Delete only for pre-launch test data
          cleanup or to correct a duplicate that slipped through. Each
          delete is logged in the audit trail.
        </div>
      </div>

      {/* ── Invoices section header with Download ZIP CTA ─────────────
       *  We keep the picker at the page top (governs both tables) and
       *  put the Download ZIP button inline above each table so admin
       *  knows exactly which set they're about to bundle. */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="text-[11px] uppercase tracking-label text-ink-mid">
          {periodLabel} · {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
        </div>
        {invoices.length > 0 ? (
          <a
            href={invoicesZipHref}
            className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white transition-colors hover:bg-vermilion hover:border-vermilion"
          >
            <FileArchive className="h-3.5 w-3.5" aria-hidden />
            Download invoices ZIP
          </a>
        ) : null}
      </div>

      {invoices.length === 0 ? (
        <p className="text-[13px] text-ink-mid">
          {scope.kind === "all"
            ? "No invoices yet — the first one will appear after the first order is paid."
            : `No invoices issued in ${periodLabel}.`}
        </p>
      ) : (
        <div className="border border-ink/10 bg-white/60">
          <table className="w-full text-[13px]">
            <thead className="bg-ink/5 text-[10px] uppercase tracking-label text-ink-mid">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Number</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Order</th>
                <th className="px-4 py-3 text-left font-medium">Country</th>
                <th className="px-4 py-3 text-right font-medium">Net</th>
                <th className="px-4 py-3 text-right font-medium">VAT</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const customer =
                  inv.order.shippingAddress
                    ? `${inv.order.shippingAddress.firstName ?? ""} ${
                        inv.order.shippingAddress.lastName ?? ""
                      }`.trim()
                    : inv.order.email;
                return (
                  <tr
                    key={inv.id}
                    className="border-t border-ink/5 transition-colors hover:bg-vermilion/5"
                  >
                    <td className="px-4 py-3 font-mono text-[12px] text-vermilion">
                      {inv.number}
                    </td>
                    <td className="px-4 py-3 text-ink-mid tabular-nums">
                      {DATE_FMT.format(inv.issuedAt)}
                    </td>
                    <td className="px-4 py-3 text-ink">{customer}</td>
                    <td className="px-4 py-3 text-ink-mid">
                      <Link
                        href={`/admin/orders/${inv.orderId}`}
                        className="inline-flex items-center gap-1 underline decoration-ink/20 underline-offset-4 hover:decoration-vermilion"
                      >
                        #{inv.order.publicNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-mid">
                      {COUNTRY_FLAG[inv.destinationCountry] ??
                        inv.destinationCountry}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-mid tabular-nums">
                      {EUR.format(Number(inv.subtotalExclVat))}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-mid tabular-nums">
                      {EUR.format(Number(inv.vatTotal))}
                    </td>
                    <td className="px-4 py-3 text-right text-ink tabular-nums">
                      {EUR.format(Number(inv.grandTotal))}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <div className="flex flex-col items-end gap-2">
                        <Link
                          href={`/admin/invoices/${inv.id}/download`}
                          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-mid hover:text-vermilion"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden />
                          PDF
                          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                        </Link>
                        <DeleteInvoice
                          invoiceId={inv.id}
                          invoiceNumber={inv.number}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Credit notes ───────────────────────────────────────────────
       *  Lives on the same page as invoices because that's the page an
       *  admin opens when they think "where's the paper trail." */}
      <section className="mt-16">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Admin · Bookkeeping</div>
            <h2 className="mt-2 font-display text-[28px] leading-tight text-ink">
              Credit notes
            </h2>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-mid">
              Every refund issued via the return pipeline generates a
              sequential credit note (Code TVA Art. 53octies). These are
              the legal counter-document to the invoices above — same
              retention rules, same audit trail.
            </p>
          </div>
        </header>

        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="text-[11px] uppercase tracking-label text-ink-mid">
            {periodLabel} · {creditNotes.length} credit note{creditNotes.length === 1 ? "" : "s"}
          </div>
          {creditNotes.length > 0 ? (
            <a
              href={creditNotesZipHref}
              className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white transition-colors hover:bg-vermilion hover:border-vermilion"
            >
              <FileArchive className="h-3.5 w-3.5" aria-hidden />
              Download credit notes ZIP
            </a>
          ) : null}
        </div>

        {creditNotes.length === 0 ? (
          <p className="text-[13px] text-ink-mid">
            {scope.kind === "all"
              ? "No credit notes yet — they appear here automatically when a return is marked Received with a refund amount."
              : `No credit notes issued in ${periodLabel}.`}
          </p>
        ) : (
          <div className="border border-ink/10 bg-white/60">
            <table className="w-full text-[13px]">
              <thead className="bg-ink/5 text-[10px] uppercase tracking-label text-ink-mid">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Number</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Invoice</th>
                  <th className="px-4 py-3 text-left font-medium">Order</th>
                  <th className="px-4 py-3 text-left font-medium">Return</th>
                  <th className="px-4 py-3 text-left font-medium">Reason</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {creditNotes.map((cn) => {
                  const reasonLabel =
                    CN_REASON_LABEL[cn.reason] ?? cn.reason;
                  const reasonTint =
                    CN_REASON_TINT[cn.reason] ??
                    "border-ink/20 bg-ink/5 text-ink-mid";
                  return (
                    <tr
                      key={cn.id}
                      className="border-t border-ink/5 transition-colors hover:bg-vermilion/5"
                    >
                      <td className="px-4 py-3 font-mono text-[12px] text-vermilion">
                        {cn.number}
                      </td>
                      <td className="px-4 py-3 text-ink-mid tabular-nums">
                        {DATE_FMT.format(cn.issuedAt)}
                      </td>
                      <td className="px-4 py-3 text-ink-mid">
                        <Link
                          href={`/admin/invoices/${cn.invoice.id}/download`}
                          className="font-mono text-[12px] underline decoration-ink/20 underline-offset-4 hover:decoration-vermilion"
                        >
                          {cn.invoice.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-mid">
                        <Link
                          href={`/admin/orders/${cn.order.id}`}
                          className="inline-flex items-center gap-1 underline decoration-ink/20 underline-offset-4 hover:decoration-vermilion"
                        >
                          #{cn.order.publicNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-mid">
                        {cn.return ? (
                          <Link
                            href={`/admin/returns/${cn.return.id}`}
                            className="inline-flex items-center gap-1 underline decoration-ink/20 underline-offset-4 hover:decoration-vermilion"
                          >
                            {cn.return.publicNumber}
                          </Link>
                        ) : (
                          <span className="text-ink-mid/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center border px-2 py-0.5 text-[10px] uppercase tracking-label ${reasonTint}`}
                        >
                          {reasonLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-ink tabular-nums">
                        {EUR.format(Number(cn.grandTotal))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/credit-notes/${cn.id}/download`}
                          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-mid hover:text-vermilion"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden />
                          PDF
                          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
