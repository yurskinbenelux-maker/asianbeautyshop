-- Curated Instagram showcase. Each row is a tile shown below the
-- journal teaser on the homepage. Sofia adds posts via
-- /admin/marketing/instagram. We deliberately don't auto-pull from
-- Meta — keeps the surface luxury-curated and avoids the entire
-- category of "Meta API token expired" outages.

CREATE TABLE "InstagramPost" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "imageUrl"    TEXT NOT NULL,
  "imageAlt"    TEXT,
  "postUrl"     TEXT NOT NULL,
  "caption"     TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);

CREATE INDEX "InstagramPost_isActive_sortOrder_idx"
  ON "InstagramPost" ("isActive", "sortOrder");
