-- Move brand trust signals (certifications + safety note) from the
-- Brand row to BrandTranslation so each locale can have its own copy
-- and DeepL can translate them like tagline + story already do.
--
-- Strategy is additive + backfill, NOT destructive:
--   1. Add the two columns to BrandTranslation.
--   2. Backfill the EN translation row for every brand that already
--      has a value on the Brand-level shadow columns.
--   3. Leave the Brand-level columns in place. The new admin form
--      stops reading/writing them; a later cleanup migration can
--      drop them once we've confirmed nothing relies on them.
--
-- Idempotent in the sense that re-running the UPDATE/INSERT against
-- already-backfilled rows is a no-op (UPDATE matches nothing new,
-- INSERT skips via NOT EXISTS).

ALTER TABLE "BrandTranslation"
  ADD COLUMN "certifications" JSONB,
  ADD COLUMN "safetyNote"     TEXT;

-- Step 2a: copy values into existing EN translation rows.
UPDATE "BrandTranslation" bt
SET
  "certifications" = b."certifications",
  "safetyNote"     = b."safetyNote"
FROM "Brand" b
WHERE bt."brandId" = b."id"
  AND bt."locale"  = 'EN'
  AND (b."certifications" IS NOT NULL OR b."safetyNote" IS NOT NULL);

-- Step 2b: brands that have trust data but no EN translation row yet
-- (rare — only if the brand was created without any tagline/story in
-- EN). Create one so the data isn't orphaned.
INSERT INTO "BrandTranslation" ("id", "brandId", "locale", "certifications", "safetyNote")
SELECT
  gen_random_uuid(),
  b."id",
  'EN',
  b."certifications",
  b."safetyNote"
FROM "Brand" b
WHERE (b."certifications" IS NOT NULL OR b."safetyNote" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "BrandTranslation" bt
    WHERE bt."brandId" = b."id" AND bt."locale" = 'EN'
  );
