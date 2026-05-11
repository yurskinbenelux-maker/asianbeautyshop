-- Brand About: add cover photo + self-reference for shared about content.
--
-- coverImageUrl: full-bleed hero on /brands/[slug]/about. Optional —
-- falls back to typographic hero when null.
--
-- aboutFromBrandId: nullable self-FK. When set, the About page renders
-- the linked brand's cover/story instead of this brand's own. Lets sub-
-- brands of the same house (Yu.R / Yu.R Pro / Yu.R Me) point at one
-- canonical About without duplicating content. ON DELETE SET NULL so
-- deleting the canonical brand doesn't cascade-remove the children.

ALTER TABLE "Brand"
  ADD COLUMN "coverImageUrl"    TEXT,
  ADD COLUMN "aboutFromBrandId" UUID;

ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_aboutFromBrandId_fkey"
  FOREIGN KEY ("aboutFromBrandId")
  REFERENCES "Brand"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Index speeds up the reverse relation lookup ("which brands inherit
-- from this one"). Cheap, helps the admin form load aliases.
CREATE INDEX "Brand_aboutFromBrandId_idx" ON "Brand"("aboutFromBrandId");
