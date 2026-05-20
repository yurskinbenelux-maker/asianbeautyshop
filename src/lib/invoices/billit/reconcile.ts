// ─────────────────────────────────────────────────────────────────────────
// Reconciliation — does Billit's stored copy match what we sent?
//
// After every successful POST /v1/orders we compare the totals Billit
// echoed back against the totals on our own Invoice/CreditNote row. If
// they differ by more than the tolerance, we flag the row as a mismatch
// and surface it in /admin/billit so a human can decide.
//
// We compare TWO numbers:
//   · grandTotal (incl VAT) — what the customer actually paid
//   · vatTotal               — what gets remitted to the Belgian state
//
// We DELIBERATELY DO NOT compare excl-VAT subtotals. Our subtotal is the
// sum-of-per-line-excl-VAT BEFORE the discount line; Billit's TotalExcl
// is the discount-adjusted net taxable base. These are two correct
// representations of the same data — comparing them would false-positive
// on every discounted invoice. The two numbers above are sufficient: if
// grandTotal AND vatTotal both match, the books reconcile.
//
// Tolerance: €0.01 absolute. With Billit's EU taxable-amount aggregation
// matching our pricing.ts method, drift should be exactly zero — but the
// €0.01 cushion absorbs the off-chance that floating-point arithmetic
// nudges a value by half a cent before we round.
// ─────────────────────────────────────────────────────────────────────────

import type { BillitOrderResponse } from "./types";

export type ReconcileInput = {
  ourGrandTotal: number;
  ourVatTotal: number;
  billit: BillitOrderResponse;
};

export type ReconcileResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      diffs: {
        field: "grandTotal" | "vatTotal";
        ours: number;
        theirs: number;
        delta: number;
      }[];
    };

const TOLERANCE_EUR = 0.01;

export function reconcileTotals(input: ReconcileInput): ReconcileResult {
  const diffs: NonNullable<Extract<ReconcileResult, { ok: false }>>["diffs"] =
    [];

  // Billit may return numbers OR strings depending on the endpoint; coerce
  // defensively so a "12.40" doesn't false-positive against 12.4.
  const theirGrand = num(input.billit.TotalIncl);
  const theirVat = num(input.billit.TotalVAT);

  const grandDelta = round2(theirGrand - input.ourGrandTotal);
  if (Math.abs(grandDelta) > TOLERANCE_EUR) {
    diffs.push({
      field: "grandTotal",
      ours: input.ourGrandTotal,
      theirs: theirGrand,
      delta: grandDelta,
    });
  }

  const vatDelta = round2(theirVat - input.ourVatTotal);
  if (Math.abs(vatDelta) > TOLERANCE_EUR) {
    diffs.push({
      field: "vatTotal",
      ours: input.ourVatTotal,
      theirs: theirVat,
      delta: vatDelta,
    });
  }

  if (diffs.length === 0) return { ok: true };

  return {
    ok: false,
    reason: `Billit echoed back totals that differ from our books: ${diffs
      .map((d) => `${d.field} ours=${d.ours} theirs=${d.theirs} (Δ${d.delta})`)
      .join("; ")}`,
    diffs,
  };
}

function num(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number.parseFloat(v) || 0;
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
