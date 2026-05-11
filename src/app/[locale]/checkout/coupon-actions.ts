// ─────────────────────────────────────────────────────────────────────────
// Checkout-side coupon lookup action.
//
// Drives the <CouponField /> client component's "Apply" button. Validates
// a coupon code against the same rules placeOrder() uses (active, in
// date window, hasn't hit max redemptions) — but does NOT increment
// redemption counts, decrement balances, or persist anything. Pure
// look-and-preview.
//
// Returns the coupon's kind + value so the client can:
//   · Show the chip with the discount preview ("ABS-WELCOME · 10% off")
//   · Feed a synthetic PricingCoupon into computeOrderTotals() for the
//     order summary's strike-through / new-total render.
//
// The actual discount math + min-subtotal check + FREE_SHIPPING handling
// all happen one layer down in computeOrderTotals() (pricing.ts). This
// action just hands the validated coupon shape across the wire.
//
// Final authoritative validation still happens in placeOrder() — a
// guest can't paste a fake coupon in devtools because we re-query the
// row at submit time. This action is UX preview only.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { prisma } from "@/lib/prisma";

export type CouponLookupResult =
  | {
      ok: true;
      code: string;
      kind: "PERCENT" | "FIXED" | "FREE_SHIPPING";
      /** Percent 0-100 for PERCENT, EUR amount for FIXED, 0 for FREE_SHIPPING. */
      value: number;
      /** Minimum subtotal (EUR) for the coupon to apply. Null = no minimum. */
      minSubtotal: number | null;
    }
  | {
      ok: false;
      reason:
        | "not-found"
        | "inactive"
        | "not-yet-active"
        | "expired"
        | "exhausted"
        | "invalid";
    };

export async function lookupCouponAction(
  rawCode: string,
): Promise<CouponLookupResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code || code.length > 40) {
    return { ok: false, reason: "invalid" };
  }

  const row = await prisma.coupon.findUnique({ where: { code } });
  if (!row) {
    return { ok: false, reason: "not-found" };
  }
  if (!row.isActive) {
    return { ok: false, reason: "inactive" };
  }

  const now = new Date();
  if (row.startsAt && row.startsAt > now) {
    return { ok: false, reason: "not-yet-active" };
  }
  if (row.endsAt && row.endsAt < now) {
    return { ok: false, reason: "expired" };
  }
  if (
    row.maxRedemptions !== null &&
    row.redemptionsUsed >= row.maxRedemptions
  ) {
    return { ok: false, reason: "exhausted" };
  }

  return {
    ok: true,
    code: row.code,
    kind: row.kind,
    value: Number(row.value),
    minSubtotal: row.minSubtotal ? Number(row.minSubtotal) : null,
  };
}
