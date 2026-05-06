// ─────────────────────────────────────────────────────────────────────────
// Sale pricing helper — single source of truth for "what does this
// product actually cost right now".
//
// Reads Product.isOnSale + Product.salePercent. When both are set, the
// effective price is `price × (1 - salePercent/100)`. Otherwise the
// regular price.
//
// Used by:
//   · Cart add-to-cart code (snapshots the discounted price + sets
//     discountReason='sale' on the line so the existing pricing engine
//     blocks coupon stacking — mirrors the quiz-reward gate).
//   · Product card / PDP UI (renders strikethrough original + discounted
//     current + −X% chip via priceForDisplay()).
//   · Anywhere else that needs to know "what would I charge for one
//     unit of this product RIGHT NOW".
//
// Decimal note: we accept either Prisma.Decimal or a plain number for
// flexibility. Internally everything goes through Number(...) which
// loses Decimal precision; for our 2-decimal EUR prices that's fine
// (the rounding step at the end snaps back to cents).
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { Prisma } from "@prisma/client";

/** Minimal shape any caller can pass — works with whatever Prisma
 *  query selected, as long as it has these three fields. */
export type SalePricingInput = {
  price: Prisma.Decimal | number | string;
  isOnSale: boolean;
  salePercent: number | null;
};

/** Snap a number to 2 decimal places (cents). Avoids the JS float
 *  artefacts that show up if `price` is a Decimal coerced to number. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The price the customer pays for one unit, in EUR (number).
 * If isOnSale is false or salePercent is missing/zero, returns the
 * regular price. Otherwise returns the discounted price.
 */
export function effectivePriceEur(p: SalePricingInput): number {
  const base = Number(p.price);
  if (!p.isOnSale) return round2(base);
  if (!p.salePercent || p.salePercent <= 0) return round2(base);
  // Cap at 90% off — a sanity guard. The schema already restricts
  // salePercent to 1-90 via the admin form, but defensive here too
  // since this helper feeds the actual price charged.
  const pct = Math.min(90, Math.max(0, p.salePercent));
  return round2(base * (1 - pct / 100));
}

/**
 * Display-friendly tuple — what every product card / PDP needs to
 * render the price section consistently:
 *
 *   • `current`        — the price to show prominently (€ Sofia gets paid)
 *   • `original`       — the strikethrough "was" price (only set when on sale)
 *   • `discountPercent` — the small "−X%" chip value (only set when on sale)
 *   • `isOnSale`       — convenience boolean for branchy UI
 *
 * The card components don't need to know the formula — they read these
 * fields straight off and lay them out.
 */
export type PriceForDisplay = {
  current: number;
  original: number | null;
  discountPercent: number | null;
  isOnSale: boolean;
};

export function priceForDisplay(p: SalePricingInput): PriceForDisplay {
  const base = round2(Number(p.price));
  if (!p.isOnSale || !p.salePercent || p.salePercent <= 0) {
    return {
      current: base,
      original: null,
      discountPercent: null,
      isOnSale: false,
    };
  }
  const pct = Math.min(90, Math.max(0, p.salePercent));
  return {
    current: round2(base * (1 - pct / 100)),
    original: base,
    discountPercent: pct,
    isOnSale: true,
  };
}
