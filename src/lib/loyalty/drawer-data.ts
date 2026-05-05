// ─────────────────────────────────────────────────────────────────────────
// drawer-data — assembles the read-only payload the YurClubDrawer needs.
//
// Called once per /[locale]/account/* render in the layout, so we batch
// all reads here rather than scattering DB hits across child pages.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  ensureLoyaltyAccount,
  readLoyaltyHistory,
  type LoyaltyAccountSummary,
} from "./account";
import { getLoyaltySettings } from "./settings";
import { getLoyaltyTiers, resolveTier, type ResolvedTier } from "./tiers";
import type { LoyaltyEventKind, LoyaltyTier } from "@prisma/client";

export type DrawerHistoryEntry = {
  id: string;
  kind: LoyaltyEventKind;
  delta: number;
  reason: string;
  createdAt: Date;
};

export type DrawerData = {
  programActive: boolean;
  account: LoyaltyAccountSummary;
  /** Customer-facing "member since" date — for the hero card subtitle.
   *  Sourced from User.createdAt so a customer who signed up before
   *  YurClub launched still sees their original signup month. */
  memberSince: Date;
  tiers: LoyaltyTier[];
  resolved: ResolvedTier;
  history: DrawerHistoryEntry[];
  /** Number of unused, currently-active personal coupons. Powers the
   *  badge on the "My coupons" tile so customers know there's something
   *  waiting without having to open the page. */
  activeCouponCount: number;
};

/** Build everything the drawer needs in one batched fetch. Auto-creates
 *  the LoyaltyAccount on the first call (with the user's first name baked
 *  into their referral code) — so a customer who signed up before YurClub
 *  launched gets their account on next page load. */
export async function getDrawerData(opts: {
  userId: string;
  firstName: string | null;
  userCreatedAt: Date;
}): Promise<DrawerData> {
  const [settings, account, tiers] = await Promise.all([
    getLoyaltySettings(),
    ensureLoyaltyAccount({
      userId: opts.userId,
      firstName: opts.firstName,
    }),
    getLoyaltyTiers(),
  ]);

  const [history, activeCouponCount] = await Promise.all([
    readLoyaltyHistory({ userId: opts.userId, limit: 50 }),
    prisma.coupon.count({
      where: {
        userId: opts.userId,
        isActive: true,
        OR: [
          { endsAt: null },
          { endsAt: { gt: new Date() } },
        ],
      },
    }),
  ]);

  const resolved = resolveTier(account.pointsLifetime, tiers);

  return {
    programActive: settings.isProgramActive,
    account: {
      pointsBalance: account.pointsBalance,
      pointsLifetime: account.pointsLifetime,
      referralCode: account.referralCode,
    },
    memberSince: opts.userCreatedAt,
    tiers,
    resolved,
    history: history.map((h) => ({
      id: h.id,
      kind: h.kind,
      delta: h.delta,
      reason: h.reason,
      createdAt: h.createdAt,
    })),
    activeCouponCount,
  };
}
