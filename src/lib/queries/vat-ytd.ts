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
// never got an invoice don't pollute the figure. If we later issue
// credit notes for refunds (Phase 2), they go on a separate sequence
// and will be subtracted there.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

export type VatYtdSnapshot = {
  year: number;
  domesticEur: number;
  crossBorderEur: number;
  /** Per-country breakdown so the widget can show which country is dominant. */
  perCountry: { country: string; eur: number }[];
  /** €10,000 — Council Directive 2006/112/EC art. 369. Hard-coded so the
   *  widget is self-contained; if the EU changes the threshold we update
   *  this one constant. */
  thresholdEur: number;
  /** "safe" | "amber" | "red" — drives the widget's colour state. */
  status: "safe" | "amber" | "red" | "exceeded";
};

const OSS_THRESHOLD_EUR = 10_000;

/**
 * Aggregate this year's invoices into the dashboard snapshot. Cheap query
 * — runs on every /admin page render but groupBy + small row count makes
 * it sub-millisecond at our volume.
 */
export async function getVatYtdSnapshot(
  now: Date = new Date(),
): Promise<VatYtdSnapshot> {
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const groups = await prisma.invoice.groupBy({
    by: ["destinationCountry"],
    where: { issuedAt: { gte: yearStart, lt: yearEnd } },
    _sum: { grandTotal: true },
  });

  let domestic = 0;
  let crossBorder = 0;
  const perCountry: { country: string; eur: number }[] = [];
  for (const g of groups) {
    const eur = Number(g._sum.grandTotal ?? 0);
    perCountry.push({ country: g.destinationCountry, eur });
    if (g.destinationCountry === "BE") {
      domestic += eur;
    } else {
      crossBorder += eur;
    }
  }

  // Sort per-country desc so the widget can show top 3 destinations.
  perCountry.sort((a, b) => b.eur - a.eur);

  let status: VatYtdSnapshot["status"] = "safe";
  if (crossBorder >= OSS_THRESHOLD_EUR) status = "exceeded";
  else if (crossBorder >= 9_500) status = "red";
  else if (crossBorder >= 7_500) status = "amber";

  return {
    year,
    domesticEur: round2(domestic),
    crossBorderEur: round2(crossBorder),
    perCountry,
    thresholdEur: OSS_THRESHOLD_EUR,
    status,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
