-- Brand About-page polish bundle:
--
--   · certifications  — JSONB Array<{code, description}> rendered as
--                       a 2-column grid below the brand story
--   · safetyNote      — free text rendered as a soft callout box
--   · coverPosition   — focal-point keyword (top|center|bottom|...) so
--                       the cover photo's letterbox crop can anchor
--                       on faces or hero product shots instead of
--                       defaulting to dead-centre cropping
--
-- All three are GLOBAL (no per-locale split) — see the schema comment
-- above each column for rationale. Additive only, fully nullable, no
-- backfill required.
ALTER TABLE "Brand"
  ADD COLUMN "certifications" JSONB,
  ADD COLUMN "safetyNote"     TEXT,
  ADD COLUMN "coverPosition"  TEXT;
