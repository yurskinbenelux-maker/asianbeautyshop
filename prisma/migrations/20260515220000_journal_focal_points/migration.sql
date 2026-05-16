-- ─────────────────────────────────────────────────────────────────────
-- Journal focal points
-- Add four nullable string columns to JournalPost so an admin can set
-- per-viewport CSS object-position values for both the 4:5 card cover
-- and the 16:9 article hero. Existing rows get NULL — the render side
-- treats NULL as "center", same crop they had before this migration.
-- Adding nullable columns is non-blocking, no data backfill needed.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE "JournalPost"
  ADD COLUMN "coverObjectPositionDesktop" TEXT,
  ADD COLUMN "coverObjectPositionMobile"  TEXT,
  ADD COLUMN "heroObjectPositionDesktop"  TEXT,
  ADD COLUMN "heroObjectPositionMobile"   TEXT;
