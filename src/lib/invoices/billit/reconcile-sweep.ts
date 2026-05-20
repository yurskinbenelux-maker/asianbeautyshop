// ─────────────────────────────────────────────────────────────────────────
// Daily reconciliation sweep.
//
// Run by /api/cron/billit-reconcile once a day. Two responsibilities:
//
//   1. RETRY unpushed rows. Find every Invoice + CreditNote in the last
//      30 days that has billitPushedAt = null AND billitAttemptCount < 5,
//      and call the push helper for each. New rows pushed → counted as
//      "newly pushed"; still-failing rows → counted as "stuck failed".
//
//   2. SURVEY known-bad rows. Find every row in the last 90 days that's
//      either:
//        · stuck-pending: never pushed, capped at attempt count 5+
//        · failed: never pushed, last attempt errored
//        · mismatch: pushed but totals don't reconcile
//      Surface them in the report for the email digest.
//
// We DO NOT re-verify already-pushed-and-reconciled rows. Once a row
// reaches that state we trust the original reconciliation check — going
// back to Billit and re-fetching every row daily would be expensive and
// gains us little (the snapshot we stored at push time is authoritative
// for our books). If an admin needs to re-verify they can hit retry from
// /admin/billit.
//
// Attempt cap: after 5 failed pushes, we stop trying. Anything still
// pending at that point is broken in a way that retries won't fix
// (auth, missing PartyID, payload validation, etc.) and needs human
// attention. The digest puts these front-and-centre.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { prisma } from "@/lib/prisma";
import { hasBillitConfig } from "./env";
import { pushCreditNoteToBillit, pushInvoiceToBillit } from "./push";

const RETRY_WINDOW_DAYS = 30;
const SURVEY_WINDOW_DAYS = 90;
const MAX_ATTEMPTS = 5;

/** A single row surfaced in the digest. */
export type DigestRow = {
  kind: "invoice" | "creditNote";
  number: string;
  issuedAt: Date;
  ourGrandTotal: number;
  billitInvoiceId: string | null;
  attempts: number;
  lastAttemptAt: Date | null;
  errorMessage: string | null;
};

export type SweepReport = {
  /** Was the sweep actually able to do anything? False when env unset. */
  configured: boolean;
  /** How many rows did we try to retry. */
  retried: number;
  /** Of those, how many newly landed (status went from pending → pushed). */
  newlyPushed: number;
  /** Of those, how many are still pending/failing (will be retried tomorrow). */
  stillPending: number;
  /** Rows pushed in a previous run where totals don't reconcile to the cent. */
  mismatches: DigestRow[];
  /** Rows that have exhausted MAX_ATTEMPTS — won't retry, need human action. */
  stuckFailures: DigestRow[];
};

export async function runBillitReconcileSweep(): Promise<SweepReport> {
  if (!hasBillitConfig()) {
    return {
      configured: false,
      retried: 0,
      newlyPushed: 0,
      stillPending: 0,
      mismatches: [],
      stuckFailures: [],
    };
  }

  const retryCutoff = new Date(
    Date.now() - RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const surveyCutoff = new Date(
    Date.now() - SURVEY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // ────────── Step 1: retry queue ────────────────────────────────────────
  // Pull rows that are eligible for retry (unpushed AND under attempt cap)
  // and fire push for each. The push helper handles its own attempt
  // bumping, so we don't double-increment here.
  const [retryInvoices, retryCreditNotes] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        issuedAt: { gte: retryCutoff },
        billitPushedAt: null,
        billitAttemptCount: { lt: MAX_ATTEMPTS },
      },
      select: { id: true },
      take: 100,
    }),
    prisma.creditNote.findMany({
      where: {
        issuedAt: { gte: retryCutoff },
        billitPushedAt: null,
        billitAttemptCount: { lt: MAX_ATTEMPTS },
      },
      select: { id: true },
      take: 100,
    }),
  ]);

  let newlyPushed = 0;
  let stillPending = 0;

  // Sequential — we don't want to hammer Billit with 100 parallel POSTs
  // on a daily sweep. They're paid-tier latency is sub-second, so 100
  // serial calls finish in roughly 100s — well within a cron-job.org
  // timeout window.
  for (const inv of retryInvoices) {
    const result = await pushInvoiceToBillit(inv.id);
    if (result.ok && result.status === "pushed") newlyPushed++;
    else stillPending++;
  }
  for (const cn of retryCreditNotes) {
    const result = await pushCreditNoteToBillit(cn.id);
    if (result.ok && result.status === "pushed") newlyPushed++;
    else stillPending++;
  }
  const retried = retryInvoices.length + retryCreditNotes.length;

  // ────────── Step 2: survey known-bad rows ─────────────────────────────
  // Mismatch = pushed AND has an error message. The reconciliation diff
  // text lives in billitErrorMessage even after pushedAt is set, because
  // the row IS in Billit's books, the numbers just don't agree.
  const [mismatchInvoices, mismatchCreditNotes, stuckInvoices, stuckCreditNotes] =
    await Promise.all([
      prisma.invoice.findMany({
        where: {
          issuedAt: { gte: surveyCutoff },
          billitPushedAt: { not: null },
          billitErrorMessage: { not: null },
        },
        orderBy: { issuedAt: "desc" },
        select: digestSelect,
      }),
      prisma.creditNote.findMany({
        where: {
          issuedAt: { gte: surveyCutoff },
          billitPushedAt: { not: null },
          billitErrorMessage: { not: null },
        },
        orderBy: { issuedAt: "desc" },
        select: digestSelect,
      }),
      // Stuck failures = exhausted attempt cap, still unpushed.
      prisma.invoice.findMany({
        where: {
          issuedAt: { gte: surveyCutoff },
          billitPushedAt: null,
          billitAttemptCount: { gte: MAX_ATTEMPTS },
        },
        orderBy: { issuedAt: "desc" },
        select: digestSelect,
      }),
      prisma.creditNote.findMany({
        where: {
          issuedAt: { gte: surveyCutoff },
          billitPushedAt: null,
          billitAttemptCount: { gte: MAX_ATTEMPTS },
        },
        orderBy: { issuedAt: "desc" },
        select: digestSelect,
      }),
    ]);

  const mismatches: DigestRow[] = [
    ...mismatchInvoices.map((r) => toDigestRow(r, "invoice")),
    ...mismatchCreditNotes.map((r) => toDigestRow(r, "creditNote")),
  ];
  const stuckFailures: DigestRow[] = [
    ...stuckInvoices.map((r) => toDigestRow(r, "invoice")),
    ...stuckCreditNotes.map((r) => toDigestRow(r, "creditNote")),
  ];

  return {
    configured: true,
    retried,
    newlyPushed,
    stillPending,
    mismatches,
    stuckFailures,
  };
}

const digestSelect = {
  number: true,
  issuedAt: true,
  grandTotal: true,
  billitInvoiceId: true,
  billitAttemptCount: true,
  billitLastAttemptAt: true,
  billitErrorMessage: true,
} as const;

function toDigestRow(
  row: {
    number: string;
    issuedAt: Date;
    grandTotal: { toString: () => string } | number;
    billitInvoiceId: string | null;
    billitAttemptCount: number;
    billitLastAttemptAt: Date | null;
    billitErrorMessage: string | null;
  },
  kind: "invoice" | "creditNote",
): DigestRow {
  return {
    kind,
    number: row.number,
    issuedAt: row.issuedAt,
    ourGrandTotal: Number(row.grandTotal),
    billitInvoiceId: row.billitInvoiceId,
    attempts: row.billitAttemptCount,
    lastAttemptAt: row.billitLastAttemptAt,
    errorMessage: row.billitErrorMessage,
  };
}
