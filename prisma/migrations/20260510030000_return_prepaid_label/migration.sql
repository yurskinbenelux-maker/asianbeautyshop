-- ─────────────────────────────────────────────────────────────────────────
-- A2 — prepaid return label fields on ReturnRequest
--
-- Sendcloud-issued return label URL (the customer-facing PDF) plus the
-- parcel id that acts as the idempotency anchor. A re-clicked "Approve"
-- button finds sendcloudReturnParcelId already set and short-circuits
-- before re-creating a billable parcel.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "ReturnRequest"
  ADD COLUMN "returnLabelUrl" TEXT,
  ADD COLUMN "sendcloudReturnParcelId" TEXT;

CREATE UNIQUE INDEX "ReturnRequest_sendcloudReturnParcelId_key"
  ON "ReturnRequest" ("sendcloudReturnParcelId");
