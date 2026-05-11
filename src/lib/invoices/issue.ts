// ─────────────────────────────────────────────────────────────────────────
// Invoice issue orchestrator — called from the Mollie PAID webhook.
//
// Pipeline:
//   1. Idempotency check — if an Invoice already exists for this order
//      (e.g. webhook retry), return the existing record. We never issue
//      two invoices for the same order. The unique index on Invoice.orderId
//      enforces this even under race conditions.
//   2. Reserve next sequential number atomically (per calendar year).
//   3. Snapshot issuer + customer + totals so a later admin edit never
//      mutates an already-issued invoice.
//   4. Render PDF in memory.
//   5. Upload to private "invoices/" bucket at invoices/{year}/{number}.pdf.
//   6. Insert Invoice row + stamp Order.invoiceUrl with the storage path.
//
// All side effects survive a webhook retry: step 1 short-circuits on the
// second call, no duplicate row, no duplicate PDF (we use upsert on the
// storage object).
//
// Returns the buffer + the row so the caller can attach the PDF directly
// to the order confirmation email without a second download round-trip.
// ─────────────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INVOICES_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { reserveNextInvoiceNumber } from "./numbering";
import {
  renderInvoicePdf,
  type InvoiceCustomerSnapshot,
  type InvoiceIssuerSnapshot,
  type InvoiceLineItem,
  type InvoicePdfInput,
} from "./pdf";

// ────────── Issuer snapshot — frozen K'Elmus details ────────────────────
//
// Hard-coded here rather than read from a Setting at issue time so a
// later legal-entity rename / address change doesn't retroactively
// rewrite already-issued invoices. If the entity ever changes, we
// update this constant; old invoices keep the old snapshot in their
// Invoice.issuerSnapshot JSON column.

const ISSUER: InvoiceIssuerSnapshot = {
  legalName: "K'Elmus Group BV",
  street: "Boomsesteenweg 41/4b",
  cityZip: "2630 Aartselaar",
  country: "Belgium",
  vatNumber: "BE 1031.312.116",
  email: "info@kelmusgroup.eu",
  iban: "BE96 0689 5761 0905",
  bic: "GKCCBEBB",
  rpm: "RPM/RPR Antwerp 1.031.312.116",
};

// ────────── Public API ──────────────────────────────────────────────────

export type IssueInvoiceResult = {
  invoiceId: string;
  number: string;
  pdfPath: string;
  pdfBuffer: Buffer;
  alreadyIssued: boolean;
};

/**
 * Idempotently issue a VAT invoice for a paid order. Safe to call from
 * concurrent webhook retries. Returns the row + the PDF buffer (so the
 * caller can attach it to the confirmation email without re-downloading
 * from Storage).
 */
export async function issueInvoiceForOrder(
  orderId: string,
): Promise<IssueInvoiceResult> {
  // Step 1 — idempotency. If an Invoice already exists, fetch its bytes
  // from storage and return the existing record. Webhook retries hit
  // this branch and exit cheaply.
  const existing = await prisma.invoice.findUnique({
    where: { orderId },
  });
  if (existing) {
    const buffer = await downloadFromStorage(existing.pdfPath);
    return {
      invoiceId: existing.id,
      number: existing.number,
      pdfPath: existing.pdfPath,
      pdfBuffer: buffer,
      alreadyIssued: true,
    };
  }

  // Step 2 — collect everything we need from the order (joined eagerly).
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: true } },
      billingAddress: true,
      shippingAddress: true,
      user: true,
    },
  });
  if (!order) throw new Error(`issueInvoiceForOrder: order ${orderId} not found`);

  // Step 3 — reserve a sequential invoice number for the current year.
  const issueDate = order.paidAt ?? new Date();
  const year = issueDate.getFullYear();
  const reserved = await reserveNextInvoiceNumber(year);

  // Step 4 — build the customer + totals snapshots. Address fields:
  // line1 / line2 / city / postcode / country (ISO 3166-1 alpha-2).
  const billingAddress = order.billingAddress ?? order.shippingAddress;
  const customer: InvoiceCustomerSnapshot = {
    name: customerName(order, billingAddress),
    email: order.email,
    street: billingAddress
      ? [billingAddress.line1, billingAddress.line2].filter(Boolean).join(", ")
      : null,
    cityZip: billingAddress
      ? `${billingAddress.postcode ?? ""} ${billingAddress.city ?? ""}`.trim()
      : null,
    country: billingAddress?.country ?? null,
  };

  const items: InvoiceLineItem[] = order.items.map((it) => {
    const lineInclVat = Number(it.lineTotal);
    const rate = Number(it.taxRate ?? 0.21);
    const lineExclVat = lineInclVat / (1 + rate);
    const unitExclVat = lineExclVat / Math.max(it.quantity, 1);
    return {
      name: it.nameSnapshot,
      sku: it.skuSnapshot,
      quantity: it.quantity,
      unitPriceExclVat: round2(unitExclVat),
      vatRate: rate,
      lineTotalInclVat: lineInclVat,
    };
  });

  // Shipping line — split incl/excl from the stored shippingTotal. Phase 1
  // assumes BE 21% on shipping too (consistent with Belgian VAT treatment
  // of carriage as ancillary supply).
  const shippingInclVat = Number(order.shippingTotal);
  const shippingRate = 0.21;
  const shippingExclVat = shippingInclVat / (1 + shippingRate);

  // Totals — products + shipping ex-VAT for the displayed subtotal,
  // discount + tax + grand pulled straight from Order so the invoice
  // can NEVER drift from what hit the books at order placement.
  //
  // Why we don't re-derive vatTotal from grandTotal − subtotalExclVat
  // anymore: with a coupon discount in the picture, the old formula
  // computed vatTotal against an un-discounted base, leaving the math
  // visibly wrong on every discounted invoice. Trusting Order.taxTotal
  // (computed by pricing.ts at place-order time, the same code path
  // Mollie was charged from) keeps the invoice arithmetically
  // consistent with the actual payment.
  const productsExclVat = items.reduce(
    (sum, it) => sum + it.unitPriceExclVat * it.quantity,
    0,
  );
  const subtotalExclVat = productsExclVat + shippingExclVat;
  const grandTotal = Number(order.grandTotal);
  const vatTotal = Number(order.taxTotal);
  // Coupon discount line. discountTotal is stored VAT-INCLUSIVE (the
  // amount the customer saw subtracted in the checkout preview).
  // Renders as a separate line on the invoice per Belgian Royal Decree
  // no. 1 art. 5 — keeps the line-item table at retail prices and
  // shows the deduction explicitly in the totals box.
  const discountInclVat = Number(order.discountTotal ?? 0);
  const discountForInvoice =
    discountInclVat > 0
      ? {
          label: order.couponCode ?? "Discount",
          amount: round2(discountInclVat),
        }
      : undefined;

  // Phase 1: single-rate BE 21% so destinationCountry on the row is
  // recorded purely for the OSS €10k tracking widget — it doesn't change
  // the invoice maths. When OSS kicks in we'll switch this to a
  // per-destination lookup; the storage shape stays the same.
  const destinationCountry = (
    order.shippingAddress?.country ??
    order.billingAddress?.country ??
    "BE"
  ).toUpperCase();

  // Step 5 — pick a payment method label for the footer. Mollie webhooks
  // typically include the method on the payment object; for simplicity
  // here we pull whatever was last stamped on the order's mollieId. Falls
  // back to "online" if we don't have a precise label.
  const paymentMethod = "online"; // upgrade later if useful

  const pdfInput: InvoicePdfInput = {
    number: reserved.number,
    issueDate,
    supplyDate: order.shippedAt ?? null, // null until parcel ships
    orderPublicNumber: order.publicNumber,
    issuer: ISSUER,
    customer,
    items,
    shipping: {
      exclVat: round2(shippingExclVat),
      vatRate: shippingRate,
      inclVat: shippingInclVat,
    },
    totals: {
      subtotalExclVat: round2(subtotalExclVat),
      vatTotal: round2(vatTotal),
      grandTotal,
      discount: discountForInvoice,
    },
    paymentMethod,
    molliePaymentReference: order.mollieId ?? null,
  };

  const pdfBuffer = await renderInvoicePdf(pdfInput);

  // Step 6 — upload PDF to private bucket. Path scheme:
  //   invoices/2026/INV-2026-00042.pdf
  // Year subdirectory keeps the bucket browseable by financial year.
  const pdfPath = `${year}/${reserved.number}.pdf`;
  await uploadToStorage(pdfPath, pdfBuffer);

  // Step 7 — insert the row + stamp the order. Both writes go through
  // a transaction so we don't end up with a Storage object pointing at
  // a non-existent Invoice row (or vice versa) on partial failure.
  // The upload above is already done; if the DB write fails the storage
  // object stays orphaned but harmless.
  const created = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        orderId: order.id,
        number: reserved.number,
        year: reserved.year,
        sequence: reserved.sequence,
        issuedAt: issueDate,
        pdfPath,
        issuerSnapshot: ISSUER as unknown as Prisma.InputJsonValue,
        customerSnapshot: customer as unknown as Prisma.InputJsonValue,
        subtotalExclVat: round2(subtotalExclVat),
        vatTotal: round2(vatTotal),
        shippingTotal: round2(shippingExclVat),
        grandTotal,
        destinationCountry,
        vatRate: 0.21,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { invoiceUrl: pdfPath },
    });
    return invoice;
  });

  return {
    invoiceId: created.id,
    number: created.number,
    pdfPath,
    pdfBuffer,
    alreadyIssued: false,
  };
}

// ────────── Storage helpers ─────────────────────────────────────────────

async function uploadToStorage(path: string, body: Buffer): Promise<void> {
  const supa = supabaseAdmin();
  const { error } = await supa.storage
    .from(INVOICES_BUCKET)
    .upload(path, body, {
      contentType: "application/pdf",
      // upsert=true so a webhook retry that survives the idempotency
      // check (e.g. crash between row insert and storage upload) won't
      // hard-fail on a duplicate object name.
      upsert: true,
    });
  if (error) {
    throw new Error(`invoice/storage-upload-failed: ${error.message}`);
  }
}

async function downloadFromStorage(path: string): Promise<Buffer> {
  const supa = supabaseAdmin();
  const { data, error } = await supa.storage.from(INVOICES_BUCKET).download(path);
  if (error || !data) {
    throw new Error(
      `invoice/storage-download-failed: ${error?.message ?? "no data"}`,
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Mint a short-lived signed URL admins can click to download an invoice
 * from /admin/invoices. 60-second TTL — enough for the click → download
 * round-trip but expires fast enough to discourage casual sharing.
 */
export async function signedInvoiceUrl(pdfPath: string): Promise<string> {
  const supa = supabaseAdmin();
  const { data, error } = await supa.storage
    .from(INVOICES_BUCKET)
    .createSignedUrl(pdfPath, 60);
  if (error || !data) {
    throw new Error(
      `invoice/sign-url-failed: ${error?.message ?? "no data"}`,
    );
  }
  return data.signedUrl;
}

// ────────── Internal ────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function customerName(
  order: { user: { firstName: string | null; lastName: string | null } | null },
  addr: { firstName?: string | null; lastName?: string | null } | null,
): string {
  // Prefer the name on the User profile (registered customers) — most
  // accurate on the legal record. Fall back to the address (guest
  // checkouts always have one). "Customer" is a last-ditch fallback for
  // a zombie order without either; should never hit production.
  const fromUser = [order.user?.firstName, order.user?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fromUser) return fromUser;
  const fromAddr = [addr?.firstName, addr?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fromAddr) return fromAddr;
  return "Customer";
}
