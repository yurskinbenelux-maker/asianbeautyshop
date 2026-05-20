// ─────────────────────────────────────────────────────────────────────────
// Push orchestrator — sends an Invoice or CreditNote into Billit.
//
// Public surface:
//   · pushInvoiceToBillit(invoiceId)      — for a sales invoice
//   · pushCreditNoteToBillit(creditNoteId) — for a credit note
//
// Both are SAFE TO CALL CONCURRENTLY for the same row (X-Idempotency-Token
// based on the row UUID guarantees Billit replays the first response on a
// duplicate POST) and SAFE TO CALL when env vars are missing (returns a
// "skipped: not configured" result so local dev doesn't error).
//
// Both are NON-THROWING for the common error cases — push failures are
// captured on the row (billitErrorMessage + billitLastAttemptAt) and
// surfaced via /admin/billit. The caller (typically the post-issuance
// pipeline in src/lib/invoices/issue.ts) wraps the call in try/catch
// belt-and-braces, but in normal operation the function returns a
// PushResult discriminated union.
//
// Flow:
//   1. Guard: env config present?
//   2. Guard: already pushed (billitPushedAt set)? Return skipped result.
//   3. Load + map row → BillitOrderRequest (via map-invoice.ts /
//      map-credit-note.ts)
//   4. Download PDF from Supabase Storage; attach as OrderPDF base64.
//      (Credit notes without a PDF skip the push — see PDF Note below.)
//   5. POST /v1/orders with X-Idempotency-Token = row.id
//   6. Reconcile Billit's echoed totals against ours
//   7. UPDATE the row:
//      · success      → billitPushedAt set, billitInvoiceId, billitSnapshot
//      · mismatch     → billitPushedAt set, billitErrorMessage = reason
//      · http failure → billitErrorMessage = error.message, no billitPushedAt
//      Always bump billitAttemptCount + billitLastAttemptAt.
//
// PDF Note:
//   CreditNote.pdfPath is nullable because PDF rendering happens in a
//   separate async pipeline (A7). If a CN comes through with pdfPath=null
//   we BAIL early and let the retry cron pick it up — Billit demands a
//   PDF for the customer/accountant document, and the Billit-generated
//   fallback would diverge from what the customer eventually receives.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INVOICES_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { BillitError, billitFetch } from "./client";
import { hasBillitConfig } from "./env";
import { mapInvoiceToBillitRequest } from "./map-invoice";
import { mapCreditNoteToBillitRequest } from "./map-credit-note";
import { reconcileTotals } from "./reconcile";
import type { BillitOrderResponse } from "./types";

// ────────── Public types ─────────────────────────────────────────────────

export type PushResult =
  | { ok: true; status: "pushed" | "already_pushed"; billitInvoiceId: string }
  | { ok: true; status: "skipped"; reason: string }
  | { ok: false; status: "failed" | "mismatch"; reason: string; retryable: boolean };

// ────────── Sales invoice ────────────────────────────────────────────────

export async function pushInvoiceToBillit(invoiceId: string): Promise<PushResult> {
  if (!hasBillitConfig()) {
    return { ok: true, status: "skipped", reason: "BILLIT_* env vars not set" };
  }

  // Cheap pre-check: is this row already pushed? Saves an API call on
  // webhook retries. The actual idempotency guarantee is at the Billit
  // layer via X-Idempotency-Token; this is just a fast path.
  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { billitPushedAt: true, billitInvoiceId: true },
  });
  if (existing?.billitPushedAt && existing.billitInvoiceId) {
    return {
      ok: true,
      status: "already_pushed",
      billitInvoiceId: existing.billitInvoiceId,
    };
  }

  // Build the Billit payload from our row.
  const mapped = await mapInvoiceToBillitRequest(invoiceId);

  // Attach the PDF — invoice PDFs are always present (issue.ts uploads
  // before inserting the row, so by the time push runs, the file is in
  // the bucket).
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { pdfPath: true, number: true },
  });
  if (!invoice) {
    return { ok: false, status: "failed", reason: "Invoice vanished mid-push", retryable: false };
  }
  const pdfBuffer = await downloadPdf(invoice.pdfPath);
  mapped.request.OrderPDF = {
    FileName: `${invoice.number}.pdf`,
    FileContent: pdfBuffer.toString("base64"),
  };

  // POST + reconcile + persist
  return await postAndPersist({
    kind: "invoice",
    rowId: invoiceId,
    request: mapped.request,
    ourGrandTotal: mapped.ourGrandTotal,
    ourVatTotal: mapped.ourVatTotal,
  });
}

// ────────── Credit note ──────────────────────────────────────────────────

export async function pushCreditNoteToBillit(
  creditNoteId: string,
): Promise<PushResult> {
  if (!hasBillitConfig()) {
    return { ok: true, status: "skipped", reason: "BILLIT_* env vars not set" };
  }

  const existing = await prisma.creditNote.findUnique({
    where: { id: creditNoteId },
    select: { billitPushedAt: true, billitInvoiceId: true, pdfPath: true },
  });
  if (existing?.billitPushedAt && existing.billitInvoiceId) {
    return {
      ok: true,
      status: "already_pushed",
      billitInvoiceId: existing.billitInvoiceId,
    };
  }
  if (!existing?.pdfPath) {
    // PDF rendering is asynchronous for CNs — let the retry cron pick
    // this up once the renderer has set pdfPath. Returning "skipped"
    // (not "failed") so the cron doesn't count it against retry attempts.
    return {
      ok: true,
      status: "skipped",
      reason: "CreditNote PDF not rendered yet",
    };
  }

  const mapped = await mapCreditNoteToBillitRequest(creditNoteId);
  if (mapped.pdfMissing) {
    return {
      ok: true,
      status: "skipped",
      reason: "CreditNote PDF not rendered yet",
    };
  }

  const pdfBuffer = await downloadPdf(existing.pdfPath);
  mapped.request.OrderPDF = {
    FileName: `${mapped.request.OrderNumber}.pdf`,
    FileContent: pdfBuffer.toString("base64"),
  };

  return await postAndPersist({
    kind: "creditNote",
    rowId: creditNoteId,
    request: mapped.request,
    ourGrandTotal: mapped.ourGrandTotal,
    ourVatTotal: mapped.ourVatTotal,
  });
}

// ────────── Shared post + persist machinery ─────────────────────────────

type PostInput = {
  kind: "invoice" | "creditNote";
  rowId: string;
  request: import("./types").BillitOrderRequest;
  ourGrandTotal: number;
  ourVatTotal: number;
};

async function postAndPersist(input: PostInput): Promise<PushResult> {
  // Bump attempt counter + last-attempt timestamp BEFORE the network call
  // so a hung connection still leaves a trace on the row. Same pattern
  // we use elsewhere for outgoing webhooks.
  await bumpAttempt(input.kind, input.rowId);

  // POST. X-Idempotency-Token = our row.id — Billit replays the original
  // response on a duplicate, so a webhook retry / manual re-click is safe.
  let response: BillitOrderResponse;
  try {
    response = await billitFetch<BillitOrderResponse>(
      "POST",
      "/v1/orders",
      input.request,
      { idempotencyKey: input.rowId },
    );
  } catch (e) {
    const message = e instanceof BillitError
      ? `HTTP ${e.status}: ${truncate(JSON.stringify(e.body), 500)}`
      : e instanceof Error
        ? e.message
        : String(e);
    const retryable = e instanceof BillitError ? e.isRetryable() : true;
    await markFailed(input.kind, input.rowId, message);
    return { ok: false, status: "failed", reason: message, retryable };
  }

  // Reconciliation — does Billit's stored copy match what we sent?
  const recon = reconcileTotals({
    ourGrandTotal: input.ourGrandTotal,
    ourVatTotal: input.ourVatTotal,
    billit: response,
  });

  if (!recon.ok) {
    // Persist the snapshot so the admin UI can diff, but mark as
    // mismatch — pushedAt still set (Billit DOES have our document; it's
    // just that the numbers don't line up and humans need to look).
    await markMismatch(input.kind, input.rowId, recon.reason, response);
    return { ok: false, status: "mismatch", reason: recon.reason, retryable: false };
  }

  await markSuccess(input.kind, input.rowId, response);
  return {
    ok: true,
    status: "pushed",
    billitInvoiceId: response.OrderID ?? "",
  };
}

// ────────── Persistence helpers (kind-polymorphic) ──────────────────────

async function bumpAttempt(
  kind: "invoice" | "creditNote",
  id: string,
): Promise<void> {
  const data = {
    billitAttemptCount: { increment: 1 },
    billitLastAttemptAt: new Date(),
  };
  if (kind === "invoice") {
    await prisma.invoice.update({ where: { id }, data });
  } else {
    await prisma.creditNote.update({ where: { id }, data });
  }
}

async function markFailed(
  kind: "invoice" | "creditNote",
  id: string,
  message: string,
): Promise<void> {
  const data = { billitErrorMessage: truncate(message, 1000) };
  if (kind === "invoice") {
    await prisma.invoice.update({ where: { id }, data });
  } else {
    await prisma.creditNote.update({ where: { id }, data });
  }
}

async function markMismatch(
  kind: "invoice" | "creditNote",
  id: string,
  reason: string,
  response: BillitOrderResponse,
): Promise<void> {
  const data = {
    billitPushedAt: new Date(),
    billitInvoiceId: response.OrderID ?? null,
    billitSnapshot: response as unknown as Prisma.InputJsonValue,
    billitErrorMessage: truncate(reason, 1000),
  };
  if (kind === "invoice") {
    await prisma.invoice.update({ where: { id }, data });
  } else {
    await prisma.creditNote.update({ where: { id }, data });
  }
}

async function markSuccess(
  kind: "invoice" | "creditNote",
  id: string,
  response: BillitOrderResponse,
): Promise<void> {
  const data = {
    billitPushedAt: new Date(),
    billitInvoiceId: response.OrderID ?? null,
    billitSnapshot: response as unknown as Prisma.InputJsonValue,
    billitErrorMessage: null,
  };
  if (kind === "invoice") {
    await prisma.invoice.update({ where: { id }, data });
  } else {
    await prisma.creditNote.update({ where: { id }, data });
  }
}

// ────────── Helpers ──────────────────────────────────────────────────────

async function downloadPdf(path: string): Promise<Buffer> {
  const supa = supabaseAdmin();
  const { data, error } = await supa.storage
    .from(INVOICES_BUCKET)
    .download(path);
  if (error || !data) {
    throw new Error(
      `billit/push: storage download failed: ${error?.message ?? "no data"}`,
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
