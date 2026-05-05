// ─────────────────────────────────────────────────────────────────────────
// LoyaltySettings — read/write the singleton config row.
//
// All economic levers Sofia can change live here:
//   pointsPerEur, birthdayPoints, milestone cadence, referrer/referee
//   bonuses, expiry windows, master on/off switch.
//
// First-touch: if no settings row exists, the defaults below are used and
// the row is lazily created on the first read so /admin/loyalty/settings
// has something to edit when Sofia opens it.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { prisma } from "@/lib/prisma";
import type { LoyaltySettings } from "@prisma/client";

/** Hard-coded fallbacks — used by getLoyaltySettings() to seed the row.
 *  Mirror the @default values in prisma/schema.prisma so reads always
 *  produce the same shape regardless of whether the DB row exists yet. */
export const LOYALTY_DEFAULTS = {
  pointsPerEur: 5,
  birthdayPoints: 150,
  milestoneOrders: 5,
  milestonePoints: 250,
  milestoneEnabled: true,
  referrerBonus: 250,
  refereeCouponPercent: 5,
  pointsExpiryMonths: 12,
  couponExpiryReminderDays: 7,
  isProgramActive: true,
} as const;

/** Read the singleton settings row. Lazily creates it on first call so
 *  Sofia's admin form always has a row to update. Idempotent under race —
 *  if two requests both miss, the unique constraint on `singleton` makes
 *  one of the inserts fall back to a read. */
export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const existing = await prisma.loyaltySettings.findFirst();
  if (existing) return existing;

  try {
    return await prisma.loyaltySettings.create({
      data: { singleton: true, ...LOYALTY_DEFAULTS },
    });
  } catch {
    // Race: another request just created it. Re-read.
    const second = await prisma.loyaltySettings.findFirst();
    if (second) return second;
    throw new Error("LoyaltySettings: failed to seed singleton");
  }
}

/** Convenience: just the boolean. Used by the drawer to decide whether to
 *  render the entry button at all. Cheap because `findFirst` hits the
 *  one-row table and returns instantly. */
export async function isLoyaltyProgramActive(): Promise<boolean> {
  const s = await getLoyaltySettings();
  return s.isProgramActive;
}
