// ─────────────────────────────────────────────────────────────────────────
// /admin/invoices — listing of every issued VAT invoice.
//
// an admin opens this for two reasons:
//   1. Quarterly bookkeeping — download a date range to send to the
//      accountant.
//   2. Re-send a specific invoice to a customer if they lost it.
//
// Phase 1 ships the listing + per-row download. ZIP export of a date
// range is on the roadmap (#211 follow-up) — for now an admin clicks one
// row at a time, which is fine while order volume is small.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Download, ExternalLink, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { DeleteInvoice } from "@/components/admin/invoices/delete-invoice";

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

export const dynamic = "force-dynamic";

// Credit-note reason → human label + badge tint. Keeps the table cell
// from being a wall of UPPER_SNAKE_CASE and gives the auditor a visual
// hint of which CN is RMA-driven vs. discretionary.
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

export default async function AdminInvoicesPage() {
  await requireAdmin();

  // Fetch latest 200 — most accountants only ever look at the last
  // quarter, and our annual volume won't push past this for a while.
  // When it does, we'll add pagination.
  const invoices = await prisma.invoice.findMany({
    orderBy: { issuedAt: "desc" },
    take: 200,
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

  // ── Credit notes — same retention/visibility discipline as invoices.
  // An admin needs to be able to look up a CN by its number (when
  // talking to a customer who's asking why their refund hasn't landed)
  // and pull the PDF for the accountant. We surface the same 200-row
  // window as invoices; pagination follows the same trigger.
  const creditNotes = await prisma.creditNote.findMany({
    orderBy: { issuedAt: "desc" },
    take: 200,
    include: {
      invoice: { select: { id: true, number: true } },
      order: { select: { id: true, publicNumber: true } },
      return: { select: { id: true, publicNumber: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-8 py-12">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
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
      </header>

      {/* Retention banner — explains the legal floor and the only
       *  legitimate scenarios for deletion (test data pre-launch +
       *  duplicate-invoice corrections). The Delete buttons below
       *  themselves carry an additional confirmation step (typed
       *  invoice number) so this is reinforcement, not the only
       *  guard. */}
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

      {invoices.length === 0 ? (
        <p className="text-[13px] text-ink-mid">
          No invoices yet — the first one will appear after the first
          order is paid.
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
                      {/* Stack PDF + Delete vertically — Delete unfurls
                       *  inline into a small confirmation form, so a
                       *  flex column keeps both states tidy. */}
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
       *  admin opens when they think "where's the paper trail." A CN is
       *  a value-reversal of an invoice — separating them onto a
       *  different screen would force the admin to context-switch
       *  during a refund conversation with a customer.
       *
       *  Belgian Royal Decree no. 1 art. 5 requires credit notes to be
       *  retained on the same 7/10-year clock as invoices, so the
       *  retention banner above implicitly covers these too. */}
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

        {creditNotes.length === 0 ? (
          <p className="text-[13px] text-ink-mid">
            No credit notes yet — they appear here automatically when a
            return is marked Received with a refund amount.
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
