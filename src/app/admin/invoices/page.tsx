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
    </div>
  );
}
