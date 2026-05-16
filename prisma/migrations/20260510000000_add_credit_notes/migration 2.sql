-- ─────────────────────────────────────────────────────────────────────────
-- G11 — CreditNote model + per-year sequence storage convention.
--
-- Belgian Code TVA Art. 53octies (Royal Decree no. 1, art. 5) requires
-- credit-note numbers to be unique, sequential, and gap-free, exactly
-- like invoices. Format mirrors invoices: CN-2026-00042, year-segmented.
--
-- The sequence itself lives in the Setting table (key: creditnote.next.YYYY)
-- — same pattern the invoice numbering already uses, so no DDL needed
-- here for the counter. This migration only creates the CreditNote table
-- and its enum.
-- ─────────────────────────────────────────────────────────────────────────

-- Reasons for issuing a credit note. RETURN dominates; the rest exist
-- because Belgian law allows credit notes for any post-invoice value
-- reversal, not only customer returns.
CREATE TYPE "CreditNoteReason" AS ENUM (
  'RETURN',
  'CANCELLATION',
  'PRICE_ADJUSTMENT',
  'GOODWILL',
  'DUPLICATE'
);

CREATE TABLE "CreditNote" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceId"          UUID NOT NULL,
  "orderId"            UUID NOT NULL,
  "returnId"           UUID,
  "number"             TEXT NOT NULL,
  "year"               INTEGER NOT NULL,
  "sequence"           INTEGER NOT NULL,
  "issuedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pdfPath"            TEXT,
  "issuerSnapshot"     JSONB NOT NULL,
  "customerSnapshot"   JSONB NOT NULL,
  "subtotalExclVat"    DECIMAL(10,2) NOT NULL,
  "vatTotal"           DECIMAL(10,2) NOT NULL,
  "shippingTotal"      DECIMAL(10,2) NOT NULL,
  "grandTotal"         DECIMAL(10,2) NOT NULL,
  "destinationCountry" TEXT NOT NULL,
  "vatRate"            DECIMAL(5,4) NOT NULL,
  "reason"             "CreditNoteReason" NOT NULL,
  "reasonNote"         TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- Unique on number — auditor's gap-detection sweep relies on this.
CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote" ("number");

-- (year, sequence) is the natural lookup for "show me credit notes
-- 1..N for 2026" reports + the integrity check that no sequence is
-- skipped or duplicated.
CREATE INDEX "CreditNote_year_sequence_idx"
  ON "CreditNote" ("year", "sequence");

-- Lookups by parent invoice / order / return — admin order detail and
-- return detail pages query along these axes.
CREATE INDEX "CreditNote_invoiceId_idx"  ON "CreditNote" ("invoiceId");
CREATE INDEX "CreditNote_orderId_idx"    ON "CreditNote" ("orderId");
CREATE INDEX "CreditNote_returnId_idx"   ON "CreditNote" ("returnId");

-- Drives the OSS / VAT YTD subtraction widget — same query shape as
-- the existing Invoice (destinationCountry, issuedAt) index.
CREATE INDEX "CreditNote_destinationCountry_issuedAt_idx"
  ON "CreditNote" ("destinationCountry", "issuedAt");

CREATE INDEX "CreditNote_issuedAt_idx"
  ON "CreditNote" ("issuedAt");

-- FKs.
--
--   invoiceId → Invoice.id     CASCADE  (a deleted invoice removes its
--                                        credit notes too — only happens
--                                        pre-launch during cleanup; in
--                                        production the retention floor
--                                        is 7 years, so this never fires)
--   orderId   → Order.id       CASCADE  (mirrors Invoice's order FK)
--   returnId  → ReturnRequest  SET NULL (the credit note survives even
--                                        if the originating return is
--                                        deleted — the legal record on
--                                        the credit note stands on its
--                                        own once issued)
ALTER TABLE "CreditNote"
  ADD CONSTRAINT "CreditNote_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditNote"
  ADD CONSTRAINT "CreditNote_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditNote"
  ADD CONSTRAINT "CreditNote_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "ReturnRequest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
