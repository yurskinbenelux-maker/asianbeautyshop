-- Billit mirror tracking columns.
--
-- After this migration runs, every Invoice + CreditNote row gains six
-- nullable fields that record whether (and when) we successfully shadowed
-- that document into K'Elmus' Billit account. None of these affect the
-- customer-facing PDF or the BTW figures on our own books — Billit is a
-- mirror for the accountant, not the source of truth.
--
-- All columns are nullable / defaulted so existing rows take the
-- migration without backfill. The Billit pipeline only ever populates
-- rows issued AFTER the integration ships; historical invoices stay at
-- billitPushedAt=NULL forever, which is fine — they're already in the
-- accountant's hands through other means (the manual export Max ran).
--
-- Indexes on billitPushedAt support the reconciliation cron's
-- "find me everything not pushed yet" sweep.

ALTER TABLE "Invoice"
  ADD COLUMN "billitPushedAt"      TIMESTAMP(3),
  ADD COLUMN "billitInvoiceId"     TEXT,
  ADD COLUMN "billitSnapshot"      JSONB,
  ADD COLUMN "billitErrorMessage"  TEXT,
  ADD COLUMN "billitLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "billitAttemptCount"  INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CreditNote"
  ADD COLUMN "billitPushedAt"      TIMESTAMP(3),
  ADD COLUMN "billitInvoiceId"     TEXT,
  ADD COLUMN "billitSnapshot"      JSONB,
  ADD COLUMN "billitErrorMessage"  TEXT,
  ADD COLUMN "billitLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "billitAttemptCount"  INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Invoice_billitPushedAt_idx"    ON "Invoice"    ("billitPushedAt");
CREATE INDEX "CreditNote_billitPushedAt_idx" ON "CreditNote" ("billitPushedAt");
