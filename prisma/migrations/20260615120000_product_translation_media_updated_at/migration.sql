-- Per-locale product content timestamps for accurate sitemap lastmod.
-- Backfill from existing parent/product timestamps — not CURRENT_TIMESTAMP.

ALTER TABLE "ProductTranslation"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ProductTranslation" pt
SET
  "createdAt" = p."createdAt",
  "updatedAt" = p."updatedAt"
FROM "Product" p
WHERE pt."productId" = p.id;

ALTER TABLE "Media"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Media"
SET "updatedAt" = "createdAt";
