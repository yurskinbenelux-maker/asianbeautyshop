-- ─────────────────────────────────────────────────────────────────────────
-- G9 — CreditNoteItem (per-line breakdown on credit notes)
--
-- Belgian Royal Decree no. 1 art. 5 requires credit notes to show line-
-- level detail so the auditor can reconcile each refunded item against
-- the original invoice line. Until G9, the CN PDF synthesised a single
-- "Refund · return ABS-1042-R1" line — legally on the edge for partial
-- refunds. This migration adds the proper line-item table.
--
-- Frozen-at-issue snapshots: nameSnapshot + skuSnapshot are duplicated
-- from the ReturnItem at the moment the CN is issued, so a later
-- product rename / SKU change doesn't retroactively rewrite the legal
-- record. Same defensive pattern Invoice + ReturnItem already use.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "CreditNoteItem" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "creditNoteId"     UUID NOT NULL,
  "nameSnapshot"     TEXT NOT NULL,
  "skuSnapshot"      TEXT NOT NULL,
  "quantity"         INTEGER NOT NULL,
  "unitPriceExclVat" DECIMAL(10,2) NOT NULL,
  "vatRate"          DECIMAL(5,4) NOT NULL,
  "lineTotalInclVat" DECIMAL(10,2) NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CreditNoteItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreditNoteItem_creditNoteId_idx"
  ON "CreditNoteItem" ("creditNoteId");

ALTER TABLE "CreditNoteItem"
  ADD CONSTRAINT "CreditNoteItem_creditNoteId_fkey"
  FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
