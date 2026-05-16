-- ─────────────────────────────────────────────────────────────────────────
-- A6 — A-Beauty Club refund reversal
--
-- Adds the machine-distinguishable enum value REVERSED_REFUND so refund
-- clawbacks aren't lumped in with manual ADJUSTED_ADMIN tweaks (G10
-- audit log will care about this distinction; analytics dashboards
-- already filter by event kind).
--
-- Adds returnId on LoyaltyEvent so the idempotency check for "has this
-- return already had its points reversed?" is a single equality query
-- against an indexed column rather than a free-text reason scan.
-- ─────────────────────────────────────────────────────────────────────────

-- Postgres requires ALTER TYPE ADD VALUE outside a transaction in older
-- versions. Prisma's migrate runner handles this — separate statement
-- with no DDL siblings between BEGIN/COMMIT for this enum-add line.
ALTER TYPE "LoyaltyEventKind" ADD VALUE 'REVERSED_REFUND';

ALTER TABLE "LoyaltyEvent"
  ADD COLUMN "returnId" UUID;

CREATE INDEX "LoyaltyEvent_returnId_idx" ON "LoyaltyEvent" ("returnId");
