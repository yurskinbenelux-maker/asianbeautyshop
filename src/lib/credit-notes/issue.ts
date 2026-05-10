// ─────────────────────────────────────────────────────────────────────────
// Refund + credit-note orchestrator (A1)
//
// Called when an admin marks a return as RECEIVED with a refund amount
// confirmed. Does the two things that always need to happen together for
// Belgian VAT bookkeeping to balance:
//
//   1. Issue the refund through Mollie (real money flows)
//   2. Mint a CreditNote row with a fresh CN-2026-NNNNN sequence number
//
// Ordering:
//   Mollie call FIRST, then DB write. The CN-2026-NNNNN sequence has to
//   stay gap-free (Belgian Code TVA Art. 53octies). If we reserved a CN
//   number then Mollie threw a network error, we'd either skip a number
//   (forbidden) or have to roll back a UPSERT counter (atomic write —
//   not actually rollback-able). Mollie-first means a failed refund
//   leaves the counter untouched and the admin can simply retry.
//
// Idempotency:
//   ReturnRequest.mollieRefundId is the gate. If a refund was already
//   issued for this return, we short-circuit before talking to Mollie
//   so a re-clicked "Mark received" button never produces a double
//   refund. The unique index on the column also catches a race in the DB
//   layer — concurrent admin clicks would conflict on the second write.
//
// VAT split (back-calculated from a VAT-inclusive customer total):
//   Admin enters the refund amount in customer-facing euros (what the
//   customer's bank will see come back). We back-calculate the VAT
//   portion using the original Invoice's vatRate:
//     vatTotal      = amount × (vatRate / (1 + vatRate))
//     subtotalExclVat = amount − vatTotal
//   This is the convention Belgian accountants use for credit notes
//   issued against a VAT-inclusive sale. Shipping is currently rolled
//   into subtotalExclVat — when G9 (per-line-item refunds) lands, the
//   admin form will let them split shipping out separately.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMollie } from "@/lib/mollie/client";
import { INVOICES_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { reserveNextCreditNoteNumber } from "./numbering";
import {
  renderCreditNotePdf,
  type CreditNoteCustomerSnapshot,
  type CreditNoteIssuerSnapshot,
  type CreditNoteLineItem,
  type CreditNotePdfInput,
} from "./pdf";

export type IssueRefundInput = {
  returnId: string;
  /** VAT-inclusive amount in EUR, two-decimal — what the customer sees back. */
  refundAmount: number;
  /** Reason taxonomy for the credit note (RETURN is the default). */
  reason?: "RETURN" | "CANCELLATION" | "PRICE_ADJUSTMENT" | "GOODWILL" | "DUPLICATE";
  /** Optional admin free-text reason note attached to the CN row. */
  reasonNote?: string | null;
  /** Audit trail for OrderEvent. */
  actorId?: string | null;
  actorEmail?: string | null;
};

export type IssueRefundResult = {
  /** Mollie refund id (re_xxxx) — new, or the cached one if idempotent skip. */
  mollieRefundId: string;
  /** Fresh CN-2026-NNNNN. Empty string when result.alreadyIssued is true. */
  creditNoteNumber: string;
  /** Database id of the CreditNote row. */
  creditNoteId: string;
  /** True when this call was a no-op against an already-issued return. */
  alreadyIssued: boolean;
};

export class IssueRefundError extends Error {
  constructor(
    public code:
      | "return-not-found"
      | "no-original-payment"
      | "no-original-invoice"
      | "amount-invalid"
      | "amount-exceeds-grand-total"
      | "mollie-refund-failed"
      | "db-write-failed",
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "IssueRefundError";
  }
}

/**
 * Issue a Mollie refund and write the matching CreditNote in one logical
 * step. Returns idempotent on the second call for the same return.
 *
 * Caller responsibilities:
 *   · requireAdmin() — this helper does no auth.
 *   · transitionReturnStatus(...) → "RECEIVED" — call this AFTER a
 *     successful refund so the status flip and the refund land
 *     together. (We don't transition inside this helper because the
 *     caller may want to e.g. stay in RECEIVED on partial refunds and
 *     only flip to REFUNDED on the second/final call.)
 */
export async function issueRefundAndCreditNote(
  input: IssueRefundInput,
): Promise<IssueRefundResult> {
  // ── 1. Load the return + parent order + invoice ────────────────────
  const ret = await prisma.returnRequest.findUnique({
    where: { id: input.returnId },
    select: {
      id: true,
      publicNumber: true,
      orderId: true,
      mollieRefundId: true,
      order: {
        select: {
          id: true,
          publicNumber: true,
          mollieId: true,
          grandTotal: true,
          invoice: {
            select: {
              id: true,
              vatRate: true,
              destinationCountry: true,
              issuerSnapshot: true,
              customerSnapshot: true,
            },
          },
        },
      },
    },
  });
  if (!ret) {
    throw new IssueRefundError(
      "return-not-found",
      `Return ${input.returnId} not found`,
    );
  }

  // ── 2. Idempotency: already issued? ────────────────────────────────
  if (ret.mollieRefundId) {
    const existingCn = await prisma.creditNote.findFirst({
      where: { returnId: ret.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true },
    });
    return {
      mollieRefundId: ret.mollieRefundId,
      creditNoteNumber: existingCn?.number ?? "",
      creditNoteId: existingCn?.id ?? "",
      alreadyIssued: true,
    };
  }

  if (!ret.order.mollieId) {
    throw new IssueRefundError(
      "no-original-payment",
      `Order ${ret.order.publicNumber} has no Mollie payment id — refunds can only be issued against Mollie-paid orders. For gift-card-only orders, refund manually by topping up the customer's balance.`,
    );
  }
  if (!ret.order.invoice) {
    throw new IssueRefundError(
      "no-original-invoice",
      `Order ${ret.order.publicNumber} has no invoice — issue the invoice first via /admin/invoices, then retry the refund. (Belgian credit notes must reference an invoice.)`,
    );
  }

  // ── 3. Validate amount ─────────────────────────────────────────────
  const amount = round2(input.refundAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new IssueRefundError(
      "amount-invalid",
      `Refund amount must be a positive number, got ${input.refundAmount}`,
    );
  }
  const grandTotal = Number(ret.order.grandTotal);
  if (amount > grandTotal + 0.01) {
    throw new IssueRefundError(
      "amount-exceeds-grand-total",
      `Refund amount €${amount.toFixed(2)} exceeds order grand total €${grandTotal.toFixed(2)}`,
    );
  }

  // ── 4. Issue the Mollie refund FIRST ───────────────────────────────
  // If this throws, no CN number is reserved and no DB row is written.
  // Admin retries after fixing the cause.
  const mollie = getMollie();
  let mollieRefund;
  try {
    mollieRefund = await mollie.paymentRefunds.create({
      paymentId: ret.order.mollieId,
      amount: { currency: "EUR", value: amount.toFixed(2) },
      description: `Refund for return ${ret.publicNumber} (order ${ret.order.publicNumber})`,
      metadata: {
        returnId: ret.id,
        returnPublicNumber: ret.publicNumber,
        orderId: ret.order.id,
        orderPublicNumber: ret.order.publicNumber,
      },
    });
  } catch (err) {
    throw new IssueRefundError(
      "mollie-refund-failed",
      err instanceof Error
        ? err.message
        : "Mollie payments_refunds.create threw an unknown error",
      err,
    );
  }

  // ── 5. Back-calculate the VAT split ────────────────────────────────
  const vatRate = Number(ret.order.invoice.vatRate); // 0.21 for BE 21%
  const vatTotal = round2(amount * (vatRate / (1 + vatRate)));
  const subtotalExclVat = round2(amount - vatTotal);

  // ── 6. Reserve CN number + persist row in one DB transaction ───────
  // We don't put the Mollie call inside this tx because Mollie is an
  // external network call — Prisma transactions hold locks for their
  // duration and we don't want to hold a DB transaction across an HTTP
  // round trip. Order is: Mollie OK → reserve CN number (atomic) →
  // INSERT CreditNote + UPDATE ReturnRequest.
  const issueDate = new Date();
  const year = issueDate.getFullYear();
  const reserved = await reserveNextCreditNoteNumber(year);

  let creditNoteId: string;
  try {
    creditNoteId = await prisma.$transaction(async (tx) => {
      const cn = await tx.creditNote.create({
        data: {
          invoiceId: ret.order.invoice!.id,
          orderId: ret.order.id,
          returnId: ret.id,
          number: reserved.number,
          year: reserved.year,
          sequence: reserved.sequence,
          issuedAt: issueDate,
          // PDF rendering is A7's job — leaving null here. The numbering
          // + totals + audit trail still satisfy the legal record.
          pdfPath: null,
          issuerSnapshot: ret.order.invoice!.issuerSnapshot as Prisma.InputJsonValue,
          customerSnapshot: ret.order.invoice!.customerSnapshot as Prisma.InputJsonValue,
          subtotalExclVat: round2(subtotalExclVat),
          vatTotal: round2(vatTotal),
          // Shipping refund handling lands with G9 (partial refunds);
          // for now any refunded shipping is rolled into subtotalExclVat.
          shippingTotal: 0,
          grandTotal: round2(amount),
          destinationCountry: ret.order.invoice!.destinationCountry,
          vatRate: ret.order.invoice!.vatRate,
          reason: input.reason ?? "RETURN",
          reasonNote: input.reasonNote ?? null,
        },
      });

      await tx.returnRequest.update({
        where: { id: ret.id },
        data: {
          mollieRefundId: mollieRefund.id,
          refundAmount: round2(amount),
          // We don't stamp refundedAt here — that gets set when Mollie's
          // refund webhook reports the refund as "refunded" (terminal
          // state, money has actually moved). For now the refund is
          // "issued" but Mollie may still process it asynchronously.
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: ret.order.id,
          kind: "refund.issued",
          message: `Refund €${amount.toFixed(2)} issued via Mollie · credit note ${reserved.number}`,
          metadata: {
            returnId: ret.id,
            returnPublicNumber: ret.publicNumber,
            mollieRefundId: mollieRefund.id,
            creditNoteId: cn.id,
            creditNoteNumber: reserved.number,
            amount,
            actorId: input.actorId ?? null,
            actorEmail: input.actorEmail ?? null,
          },
        },
      });

      return cn.id;
    });
  } catch (err) {
    // The Mollie refund went through but our DB write failed — this is
    // the worst case. Log loudly with the Mollie refund id so an admin
    // can match by hand from the Mollie dashboard. The CN sequence has
    // already burned a number; we'll never re-use it (it shows up as a
    // "missing" row to auditors, which we explain in the next admin
    // notes update for that quarter).
    console.error(
      "[credit-notes/issue] DB write failed after successful Mollie refund — manual reconciliation needed",
      {
        returnId: ret.id,
        mollieRefundId: mollieRefund.id,
        cnNumber: reserved.number,
        err,
      },
    );
    throw new IssueRefundError(
      "db-write-failed",
      `Mollie refund ${mollieRefund.id} succeeded but DB write failed — record manually as ${reserved.number}`,
      err,
    );
  }

  // ── 7. Mint the PDF (A7) ───────────────────────────────────────────
  // Best-effort, non-blocking on failure: a Storage hiccup or pdfkit
  // glitch must NOT roll back the legal record. The DB row + Mollie
  // refund already constitute the credit note for accounting purposes;
  // the PDF is the customer-facing rendering. If this throws we log
  // and move on — admin can re-mint later via mintCreditNotePdf.
  try {
    await mintCreditNotePdf(creditNoteId);
  } catch (err) {
    console.error(
      "[credit-notes/issue] PDF mint failed — row exists, can be re-rendered later",
      { creditNoteId, cnNumber: reserved.number, err },
    );
  }

  return {
    mollieRefundId: mollieRefund.id,
    creditNoteNumber: reserved.number,
    creditNoteId,
    alreadyIssued: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// PDF minting — A7
//
// Idempotent on CreditNote.pdfPath. If a path is already set, downloads
// the existing PDF from Storage and returns the buffer so callers don't
// pay for a re-render. Otherwise: assemble the renderer input, call
// renderCreditNotePdf, upload to creditnotes/<year>/CN-2026-NNNNN.pdf,
// and stamp pdfPath on the row.
//
// The bucket is shared with invoices (INVOICES_BUCKET) but we use a
// distinct top-level prefix `creditnotes/` so the financial-year
// browseable structure stays clean: invoices/2026/INV-… vs
// creditnotes/2026/CN-… side by side.
// ─────────────────────────────────────────────────────────────────────────

const CREDIT_NOTES_PREFIX = "creditnotes";

export type MintCreditNotePdfResult = {
  creditNoteId: string;
  number: string;
  pdfPath: string;
  pdfBuffer: Buffer;
  alreadyMinted: boolean;
};

export async function mintCreditNotePdf(
  creditNoteId: string,
): Promise<MintCreditNotePdfResult> {
  // Load CN with the relations we need to render the PDF. Joins
  // invoice (for the original invoice number + issued date), order
  // (for publicNumber), return (for publicNumber), and the parent
  // ReturnRequest's mollieRefundId for the footer reference.
  const cn = await prisma.creditNote.findUnique({
    where: { id: creditNoteId },
    include: {
      invoice: {
        select: { number: true, issuedAt: true },
      },
      order: {
        select: { publicNumber: true },
      },
      return: {
        select: { publicNumber: true, mollieRefundId: true },
      },
    },
  });
  if (!cn) {
    throw new Error(`mintCreditNotePdf: CreditNote ${creditNoteId} not found`);
  }

  // Fast path: already minted. Round-trip the bytes from Storage so
  // the caller can attach without a separate download call.
  if (cn.pdfPath) {
    const buffer = await downloadFromStorage(cn.pdfPath);
    return {
      creditNoteId: cn.id,
      number: cn.number,
      pdfPath: cn.pdfPath,
      pdfBuffer: buffer,
      alreadyMinted: true,
    };
  }

  // Build renderer input from the row's frozen JSON snapshots — we
  // never re-derive identity from the live order/customer rows
  // because a later admin edit must not retroactively rewrite the
  // legal record on the credit note.
  const issuer = cn.issuerSnapshot as unknown as CreditNoteIssuerSnapshot;
  const customer = cn.customerSnapshot as unknown as CreditNoteCustomerSnapshot;

  const grandTotal = Number(cn.grandTotal);
  const subtotalExclVat = Number(cn.subtotalExclVat);
  const vatTotal = Number(cn.vatTotal);
  const shippingTotal = Number(cn.shippingTotal);
  const vatRate = Number(cn.vatRate);

  // A1 currently captures only the totals (no per-line breakdown). We
  // synthesise a single line "Refund · return ABS-1042-R1" so the PDF
  // table stays meaningful. When G9 lands, this becomes one row per
  // refunded ProductVariant pulled from a future CreditNoteItem table.
  const refundLineDescription =
    cn.return?.publicNumber
      ? `Refund · return ${cn.return.publicNumber}`
      : "Refund";
  const lineExclVat = subtotalExclVat;
  const items: CreditNoteLineItem[] = [
    {
      description: refundLineDescription,
      reference: `Order #${cn.order.publicNumber}`,
      quantity: 1,
      unitPriceExclVat: round2(lineExclVat),
      vatRate,
      lineTotalInclVat: round2(grandTotal - shippingTotal),
    },
  ];

  const pdfInput: CreditNotePdfInput = {
    number: cn.number,
    issueDate: cn.issuedAt,
    invoiceNumber: cn.invoice.number,
    invoiceIssuedAt: cn.invoice.issuedAt,
    orderPublicNumber: cn.order.publicNumber,
    returnPublicNumber: cn.return?.publicNumber ?? null,
    reason: cn.reason,
    reasonNote: cn.reasonNote,
    issuer,
    customer,
    items,
    shipping: {
      exclVat: round2(shippingTotal / (1 + vatRate)),
      vatRate,
      inclVat: round2(shippingTotal),
    },
    totals: {
      subtotalExclVat: round2(subtotalExclVat),
      vatTotal: round2(vatTotal),
      grandTotal: round2(grandTotal),
    },
    mollieRefundReference: cn.return?.mollieRefundId ?? null,
  };

  const pdfBuffer = await renderCreditNotePdf(pdfInput);

  // Upload to creditnotes/<year>/CN-2026-NNNNN.pdf
  const pdfPath = `${CREDIT_NOTES_PREFIX}/${cn.year}/${cn.number}.pdf`;
  await uploadToStorage(pdfPath, pdfBuffer);

  await prisma.creditNote.update({
    where: { id: cn.id },
    data: { pdfPath },
  });

  return {
    creditNoteId: cn.id,
    number: cn.number,
    pdfPath,
    pdfBuffer,
    alreadyMinted: false,
  };
}

/**
 * Mint a short-lived signed URL for an existing credit note PDF — used by
 * /admin/invoices when an admin clicks "Download CN-2026-NNNNN". 60-second
 * TTL matches the invoice signed-URL helper.
 */
export async function signedCreditNoteUrl(pdfPath: string): Promise<string> {
  const supa = supabaseAdmin();
  const { data, error } = await supa.storage
    .from(INVOICES_BUCKET)
    .createSignedUrl(pdfPath, 60);
  if (error || !data) {
    throw new Error(
      `credit-note/sign-url-failed: ${error?.message ?? "no data"}`,
    );
  }
  return data.signedUrl;
}

// ────────── Storage helpers — shared bucket with invoices ───────────────

async function uploadToStorage(path: string, body: Buffer): Promise<void> {
  const supa = supabaseAdmin();
  const { error } = await supa.storage.from(INVOICES_BUCKET).upload(path, body, {
    contentType: "application/pdf",
    // upsert=true so a re-mint after a Storage hiccup overwrites
    // cleanly rather than 409-ing on the existing object.
    upsert: true,
  });
  if (error) {
    throw new Error(`credit-note/storage-upload-failed: ${error.message}`);
  }
}

async function downloadFromStorage(path: string): Promise<Buffer> {
  const supa = supabaseAdmin();
  const { data, error } = await supa.storage.from(INVOICES_BUCKET).download(path);
  if (error || !data) {
    throw new Error(
      `credit-note/storage-download-failed: ${error?.message ?? "no data"}`,
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
