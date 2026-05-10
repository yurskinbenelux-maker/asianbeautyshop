-- ─────────────────────────────────────────────────────────────────────────
-- A1 — ReturnRequest.mollieRefundId
--
-- Adds the idempotency anchor for Mollie refund issuance. Set once
-- payments_refunds.create succeeds; a re-clicked "Mark received" button
-- short-circuits before talking to Mollie when this is already set.
--
-- Unique-indexed so the DB layer also catches the concurrent-clicks
-- race (the second INSERT/UPDATE conflicts on the index).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "ReturnRequest"
  ADD COLUMN "mollieRefundId" TEXT;

CREATE UNIQUE INDEX "ReturnRequest_mollieRefundId_key"
  ON "ReturnRequest" ("mollieRefundId");
