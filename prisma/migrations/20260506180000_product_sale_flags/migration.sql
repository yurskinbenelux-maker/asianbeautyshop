-- Per-product sale flags. When isOnSale=true and salePercent is set,
-- the storefront applies the discount on top of price (the regular
-- price stays as the strikethrough "was" on cards/PDP).
--
-- Both columns are NOT NULL on the boolean (default false) and
-- nullable on the percent so existing products keep their current
-- behaviour without backfill. The percent is constrained 1-90 in
-- application code (admin form + Zod schema); we don't add a CHECK
-- constraint at the DB layer because it'd block CSV imports that
-- include nulls/zeros for non-sale products.

ALTER TABLE "Product"
  ADD COLUMN "isOnSale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "salePercent" INTEGER;
