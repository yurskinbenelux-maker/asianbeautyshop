// ─────────────────────────────────────────────────────────────────────────
// VAT YTD revenue tracker — used by the OSS €10k threshold widget.
//
// Aggregates every issued Invoice (which proxies for "paid orders" since
// invoices are only issued post-PAID) into two buckets per calendar
// year:
//
//   · domestic   — Belgian deliveries, taxed at the home rate
//   · crossBorder — NL/FR/LU/DE deliveries, the bucket that counts
//                   toward the EU OSS €10,000 small-distance-seller
//                   threshold (Council Directive 2006/112/EC, art.
//                   369). Once this bucket exceeds €10k in a calendar
//                   year, an admin must register for OSS and start
//                   charging destination VAT rates.
//
// We sum from Invoice (not Order) so the dashboard only counts orders
// that are legally accounted for — refunded / cancelled orders that
// never got an invoice don't pollute the figure.
//
// As of A5 (2026-05-10) we ALSO subtract per-country CreditNote totals
// from the per-country invoice totals before classifying domestic vs
// cross-border. The OSS €10k threshold counts cross-border *supplies*
// — a refunded sale is undone supply, so the legally meaningful figure
// is net of credit notes. If a refund crossed years (rare; invoice in
// 2026 December, refund in 2027 January) the credit note's `issuedAt`
// year is what counts; both invoice and CN are scoped to the same
// `yearStart..yearEnd` window here, which means the 2026 invoice stays
// in 2026's gross figure and the 2027 CN reduces 2027's. That's what
// Belgian quarterly filing expects (you report each quarter as it
// happened, with later credit notes adjusting the period they were
// issued in, not retroactively rewriting the original).
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

export type VatYtdSnapshot = {
  year: number;
  /** Net domestic revenue (BE invoices minus BE credit notes). */
  domesticEur: number;
  /** Net cross-border revenue (NL/FR/LU/DE etc. invoices minus CN). */
  crossBorderEur: number;
  /** Per-country breakdown — already netted (invoice − credit notes). */
  perCountry: { country: string; eur: number }[];
  /** Total credit notes issued this year, all countries. Surfaced
   *  separately so the widget can render the audit-friendly line
   *  "Credits issued: € X — already subtracted above". */
  creditsEur: number;
  /** €10,000 — Council Directive 2006/112/EC art. 369. Hard-coded so the
   *  widget is self-contained; if the EU changes the threshold we update
   *  this one constant. */
  thresholdEur: number;
  /** "safe" | "amber" | "red" — drives the widget's colour state. */
  status: "safe" | "amber" | "red" | "exceeded";
};

const OSS_THRESHOLD_EUR = 10_000;

/**
 * Aggregate this year's invoices net of credit notes into the dashboard
 * snapshot. Two parallel groupBys (invoice + creditNote) — both indexed
 * on (destinationCountry, issuedAt), so query cost is sub-millisecond
 * at any realistic shop volume.
 */
export async function getVatYtdSnapshot(
  now: Date = new Date(),
): Promise<VatYtdSnapshot> {
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // Parallel — no dependencies between the two queries.
  const [invoiceGroups, creditNoteGroups] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["destinationCountry"],
      where: { issuedAt: { gte: yearStart, lt: yearEnd } },
      _sum: { grandTotal: true },
    }),
    prisma.creditNote.groupBy({
      by: ["destinationCountry"],
      where: { issuedAt: { gte: yearStart, lt: yearEnd } },
      _sum: { grandTotal: true },
    }),
  ]);

  // Build a map of credits-by-country for O(1) subtraction below.
  const creditsByCountry = new Map<string, number>();
  let totalCredits = 0;
  for (const g of creditNoteGroups) {
    const eur = Number(g._sum.grandTotal ?? 0);
    creditsByCountry.set(g.destinationCountry, eur);
    totalCredits += eur;
  }

  // Net per-country: gross invoice − credit notes for that country. A
  // country that exists only in credit notes (refund without an invoice
  // — shouldn't happen in our flow but be defensive) lands as a negative
  // entry; we don't surface it because the widget is positive-revenue
  // oriented and a stray negative would confuse the per-country list.
  let domestic = 0;
  let crossBorder = 0;
  const perCountry: { country: string; eur: number }[] = [];
  for (const g of invoiceGroups) {
    const gross = Number(g._sum.grandTotal ?? 0);
    const credits = creditsByCountry.get(g.destinationCountry) ?? 0;
    const net = gross - credits;
    if (net > 0) {
      perCountry.push({ country: g.destinationCountry, eur: net });
    }
    if (g.destinationCountry === "BE") {
      domestic += net;
    } else {
      crossBorder += net;
    }
  }

  // Sort per-country desc so the widget can show top 3 destinations.
  perCountry.sort((a, b) => b.eur - a.eur);

  // Clamp totals at 0 so a quarter where credits exceed sales (rare —
  // would require a chargeback storm) doesn't show a negative figure.
  domestic = Math.max(0, domestic);
  crossBorder = Math.max(0, crossBorder);

  let status: VatYtdSnapshot["status"] = "safe";
  if (crossBorder >= OSS_THRESHOLD_EUR) status = "exceeded";
  else if (crossBorder >= 9_500) status = "red";
  else if (crossBorder >= 7_500) status = "amber";

  return {
    year,
    domesticEur: round2(domestic),
    crossBorderEur: round2(crossBorder),
    perCountry,
    creditsEur: round2(totalCredits),
    thresholdEur: OSS_THRESHOLD_EUR,
    status,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
