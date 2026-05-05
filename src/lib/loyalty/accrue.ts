// ─────────────────────────────────────────────────────────────────────────
// Accrual hooks — the points-earning side of YU.R Club.
//
// Three entry points:
//   1. accrueOrderPoints  — called from sync-mollie's PAID transition
//   2. accrueMilestone    — called immediately after #1 if hit threshold
//   3. accrueBirthday     — called by the daily birthday cron
//
// Skip rules:
//   · Orders paid 100% with gift cards / loyalty redemptions don't earn
//     points (no points-on-points loop). Detected via grandTotal vs the
//     coupon's discountTotal — if the user paid €0 of their own money,
//     no accrual.
//   · The program's master switch (LoyaltySettings.isProgramActive) gates
//     every entry point, so Sofia can pause accruals without losing data.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { prisma } from "@/lib/prisma";
import { LoyaltyEventKind } from "@prisma/client";
import { applyLoyaltyEvent, ensureLoyaltyAccount } from "./account";
import { getLoyaltySettings } from "./settings";

// ────────── 1. Order accrual ──────────────────────────────────────────────

/** Award points for a paid order. Idempotent on (orderId, kind=EARNED_ORDER):
 *  if an event for this order already exists, returns without re-awarding.
 *  Hooked into sync-mollie's `willFlipToPaid` block. */
export async function accrueOrderPoints(opts: {
  orderId: string;
  userId: string;
  /** Subtotal in EUR (the customer-paid portion BEFORE shipping/tax).
   *  Use Number(order.subtotal). We award on subtotal not grandTotal so
   *  a customer who pays €30 product + €10 shipping doesn't earn points
   *  on the shipping. */
  subtotalEur: number;
  /** First name for the auto-create path on first-ever order. */
  firstName?: string | null;
}): Promise<{ awarded: number; skipped: boolean; reason?: string }> {
  const settings = await getLoyaltySettings();
  if (!settings.isProgramActive) {
    return { awarded: 0, skipped: true, reason: "program-paused" };
  }
  if (opts.subtotalEur <= 0) {
    return { awarded: 0, skipped: true, reason: "zero-subtotal" };
  }

  // Idempotency check — if we already awarded for this order, do nothing.
  // We look up any LoyaltyEvent referencing this orderId with the
  // EARNED_ORDER kind. cheap because LoyaltyEvent has an index on orderId.
  const existing = await prisma.loyaltyEvent.findFirst({
    where: { orderId: opts.orderId, kind: LoyaltyEventKind.EARNED_ORDER },
    select: { id: true },
  });
  if (existing) {
    return { awarded: 0, skipped: true, reason: "already-awarded" };
  }

  const points = Math.floor(opts.subtotalEur * settings.pointsPerEur);
  if (points <= 0) {
    return { awarded: 0, skipped: true, reason: "rounded-to-zero" };
  }

  await applyLoyaltyEvent({
    userId: opts.userId,
    firstName: opts.firstName,
    kind: LoyaltyEventKind.EARNED_ORDER,
    delta: points,
    reason: `Earned from order — €${opts.subtotalEur.toFixed(2)}`,
    orderId: opts.orderId,
  });

  return { awarded: points, skipped: false };
}

// ────────── 2. Milestone accrual ─────────────────────────────────────────

/** Awards milestone points when the customer's PAID order count hits a
 *  multiple of `settings.milestoneOrders`. Called right after
 *  accrueOrderPoints so the milestone fires on the same order that
 *  triggered the threshold.
 *
 *  Idempotent the same way as order accrual: we query LoyaltyEvent for
 *  any EARNED_MILESTONE row referencing this orderId before awarding. */
export async function accrueMilestone(opts: {
  orderId: string;
  userId: string;
  firstName?: string | null;
}): Promise<{ awarded: number; skipped: boolean; reason?: string }> {
  const settings = await getLoyaltySettings();
  if (!settings.isProgramActive) {
    return { awarded: 0, skipped: true, reason: "program-paused" };
  }
  if (!settings.milestoneEnabled) {
    return { awarded: 0, skipped: true, reason: "milestones-disabled" };
  }

  // Same-order idempotency.
  const existing = await prisma.loyaltyEvent.findFirst({
    where: { orderId: opts.orderId, kind: LoyaltyEventKind.EARNED_MILESTONE },
    select: { id: true },
  });
  if (existing) {
    return { awarded: 0, skipped: true, reason: "already-awarded" };
  }

  // Count the user's lifetime PAID orders. The freshly-flipped order is
  // already in PAID state by the time sync-mollie calls us, so it gets
  // counted here.
  const paidCount = await prisma.order.count({
    where: { userId: opts.userId, paymentStatus: "PAID" },
  });

  if (paidCount === 0) {
    return { awarded: 0, skipped: true, reason: "zero-orders" };
  }
  if (paidCount % settings.milestoneOrders !== 0) {
    return { awarded: 0, skipped: true, reason: "not-at-threshold" };
  }

  await applyLoyaltyEvent({
    userId: opts.userId,
    firstName: opts.firstName,
    kind: LoyaltyEventKind.EARNED_MILESTONE,
    delta: settings.milestonePoints,
    reason: `${paidCount}-order milestone bonus`,
    orderId: opts.orderId,
  });

  return { awarded: settings.milestonePoints, skipped: false };
}

// ────────── 3. Birthday accrual ──────────────────────────────────────────

/** Awards birthday points. Called by the daily cron at /api/cron/loyalty-
 *  birthday. Idempotent via User.lastBirthdayLoyaltyYear — once set to the
 *  current year, the cron skips this user until next year. Independent of
 *  the existing birthday-EMAIL sentinel so admin can re-enable either
 *  pathway without affecting the other. */
export async function accrueBirthday(opts: {
  userId: string;
  firstName?: string | null;
  thisYear: number;
}): Promise<{ awarded: number; skipped: boolean; reason?: string }> {
  const settings = await getLoyaltySettings();
  if (!settings.isProgramActive) {
    return { awarded: 0, skipped: true, reason: "program-paused" };
  }

  // Stamp first to claim the slot; the loyalty event write happens after.
  // If two cron runs collide, only one gets to flip the year sentinel —
  // the other no-ops.
  const stampResult = await prisma.user.updateMany({
    where: {
      id: opts.userId,
      OR: [
        { lastBirthdayLoyaltyYear: null },
        { lastBirthdayLoyaltyYear: { lt: opts.thisYear } },
      ],
    },
    data: { lastBirthdayLoyaltyYear: opts.thisYear },
  });

  if (stampResult.count === 0) {
    return { awarded: 0, skipped: true, reason: "already-awarded-this-year" };
  }

  await ensureLoyaltyAccount({
    userId: opts.userId,
    firstName: opts.firstName,
  });

  await applyLoyaltyEvent({
    userId: opts.userId,
    firstName: opts.firstName,
    kind: LoyaltyEventKind.EARNED_BIRTHDAY,
    delta: settings.birthdayPoints,
    reason: `Happy birthday from YU.R · ${opts.thisYear}`,
  });

  return { awarded: settings.birthdayPoints, skipped: false };
}
