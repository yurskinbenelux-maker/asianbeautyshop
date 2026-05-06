// ─────────────────────────────────────────────────────────────────────────
// Central promotions config — single source of truth for the percent-off
// values + validity windows of YU.R's automated coupons.
//
// Why centralised:
//   Before this, REGISTRATION_COUPON_PERCENT (=10) lived as a constant in
//   src/lib/coupons/registration-welcome.ts and QUIZ_REWARD_PERCENT (=15)
//   in src/lib/quiz/reward.ts. Each was referenced by the actual coupon
//   mint, by email templates, and by hardcoded text in marketing surfaces
//   (popup, exit-intent, quiz card). Sofia couldn't change either without
//   a code change.
//
//   Storing them as a single Setting row keyed `marketing.promotions`
//   means /admin/marketing/promotions can edit them at runtime — every
//   surface that reads from getPromoSettings() picks up the new values
//   on the next request.
//
// Behaviour notes:
//   · Already-issued coupons keep their original % (the value was
//     materialised onto the Coupon row at mint time). Only NEW coupons
//     issued after Sofia changes the setting use the new %.
//   · Sensible bounds enforced at write time (0-50%, 1-365 days) so a
//     fat-finger doesn't ship a 100% coupon.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SETTING_KEY = "marketing.promotions";

export type PromoSettings = {
  /** Welcome coupon issued when a customer verifies their email after
   *  signing up (mintWelcomeCoupon path). */
  registrationWelcomePct: number;
  registrationWelcomeValidDays: number;
  /** Quiz reward coupon minted when the customer completes the skin
   *  quiz (ensureQuizCoupon path). Discounts only the items in their
   *  recommended routine, not their whole cart. */
  quizRewardPct: number;
  quizRewardValidDays: number;
};

/** Defaults used if the Setting row hasn't been written yet, OR if any
 *  field is missing/corrupt. Match the originals so a fresh DB and a
 *  pre-migration DB behave identically. */
export const PROMO_DEFAULTS: PromoSettings = {
  registrationWelcomePct: 10,
  registrationWelcomeValidDays: 60,
  quizRewardPct: 15,
  quizRewardValidDays: 60,
};

/** Coerce an unknown value into an integer percentage in [0, 50]. Out
 *  of range or non-numeric → fall back to the default. Defensive: a bad
 *  setting must never crash the coupon-mint path because the cost is
 *  customer goodwill, not just a 500. */
function clampPct(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(50, Math.round(n)));
}

function clampDays(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(365, Math.round(n)));
}

export async function readPromoSettings(): Promise<PromoSettings> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
      select: { valueJson: true },
    });
    if (!row) return PROMO_DEFAULTS;

    const v = row.valueJson as Record<string, unknown> | null;
    if (!v || typeof v !== "object") return PROMO_DEFAULTS;

    return {
      registrationWelcomePct: clampPct(
        v.registrationWelcomePct,
        PROMO_DEFAULTS.registrationWelcomePct,
      ),
      registrationWelcomeValidDays: clampDays(
        v.registrationWelcomeValidDays,
        PROMO_DEFAULTS.registrationWelcomeValidDays,
      ),
      quizRewardPct: clampPct(
        v.quizRewardPct,
        PROMO_DEFAULTS.quizRewardPct,
      ),
      quizRewardValidDays: clampDays(
        v.quizRewardValidDays,
        PROMO_DEFAULTS.quizRewardValidDays,
      ),
    };
  } catch (err) {
    console.error("[promotions] read failed, using defaults", err);
    return PROMO_DEFAULTS;
  }
}

export async function writePromoSettings(next: PromoSettings): Promise<void> {
  // Re-clamp on write too — admin form already validates, but a hand-crafted
  // POST won't, and corrupt data here breaks every coupon mint downstream.
  const clean: PromoSettings = {
    registrationWelcomePct: clampPct(
      next.registrationWelcomePct,
      PROMO_DEFAULTS.registrationWelcomePct,
    ),
    registrationWelcomeValidDays: clampDays(
      next.registrationWelcomeValidDays,
      PROMO_DEFAULTS.registrationWelcomeValidDays,
    ),
    quizRewardPct: clampPct(next.quizRewardPct, PROMO_DEFAULTS.quizRewardPct),
    quizRewardValidDays: clampDays(
      next.quizRewardValidDays,
      PROMO_DEFAULTS.quizRewardValidDays,
    ),
  };
  const json = clean as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: json },
    update: { valueJson: json },
  });
}
