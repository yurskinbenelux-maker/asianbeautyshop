-- Phase 2 of the variant clarification — per-variant volume override.
-- See src/components/shop/pdp/product-purchase.tsx for the matching
-- PDP logic (single Type selector vs. two-axis Volume+Type selector).
--
-- Nullable on purpose: existing variants stay null and behave exactly
-- like today (single-axis Type selector + product-level Volume line).
-- Only when an admin fills DIFFERENT volumeMl values across variants
-- on the same product does the PDP switch to two-axis mode.

ALTER TABLE "ProductVariant" ADD COLUMN "volumeMl" INTEGER;
