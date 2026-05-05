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
import { listRedeemableRewards, type RedeemableReward } from "./redeem";
import { listTasksForUser, type TaskWithStatus } from "./tasks";
import { Locale } from "@prisma/client";
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
  /** Top N rewards for the drawer's "Ways to redeem" section. The full
   *  catalogue lives at /account/club/redeem; here we surface the
   *  cheapest 4 sorted by points cost so the customer sees something
   *  actionable without scrolling. */
  topRewards: RedeemableReward[];
  /** All active tasks with this customer's status — both AUTO rows
   *  (decorative) and MANUAL_REVIEW rows (claimable). Drawer surfaces
   *  the top 4 with a "See all" link to /account/club/earn. */
  topTasks: TaskWithStatus[];
  /** Milestone progress visualisation for the drawer's Milestone block.
   *  Null when Sofia disabled the feature in /admin/loyalty/settings. */
  milestone: {
    /** How many paid orders the customer has placed in total (lifetime). */
    paidOrderCount: number;
    /** Sofia's setting — every Nth order awards milestonePoints. */
    every: number;
    /** Bonus points each milestone awards. */
    bonusPoints: number;
    /** Orders into the CURRENT cycle. 0..every-1. */
    progress: number;
    /** Orders still needed to hit the next milestone (1..every). */
    ordersToNext: number;
  } | null;
};

/** Map a next-intl locale code to the Prisma Locale enum. Centralised so
 *  both the layout and the drawer-data builder agree. */
function toPrismaLocale(s: string): Locale {
  switch (s.toLowerCase()) {
    case "nl": return Locale.NL;
    case "fr": return Locale.FR;
    case "ru": return Locale.RU;
    default:   return Locale.EN;
  }
}

/** Build everything the drawer needs in one batched fetch. Auto-creates
 *  the LoyaltyAccount on the first call (with the user's first name baked
 *  into their referral code) — so a customer who signed up before YurClub
 *  launched gets their account on next page load. */
export async function getDrawerData(opts: {
  userId: string;
  firstName: string | null;
  userCreatedAt: Date;
  locale: string;
}): Promise<DrawerData> {
  const [settings, account, tiers] = await Promise.all([
    getLoyaltySettings(),
    ensureLoyaltyAccount({
      userId: opts.userId,
      firstName: opts.firstName,
    }),
    getLoyaltyTiers(),
  ]);

  const prismaLocale = toPrismaLocale(opts.locale);

  const [history, activeCouponCount, topRewards, allTasks, paidOrderCount] =
    await Promise.all([
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
      listRedeemableRewards({
        userId: opts.userId,
        locale: prismaLocale,
        limit: 4,
      }),
      listTasksForUser({ userId: opts.userId }),
      prisma.order.count({
        where: { userId: opts.userId, paymentStatus: "PAID" },
      }),
    ]);
  // Surface the 4 most relevant tasks: AUTO rows + claimable MANUAL_REVIEW
  // rows take priority over already-approved/pending ones so the drawer
  // shows actionable copy first.
  const topTasks = [...allTasks]
    .sort((a, b) => {
      const order = (s: TaskWithStatus["status"]) =>
        s === "available" ? 0 : s === "auto" ? 1 : s === "pending" ? 2 : 3;
      return order(a.status) - order(b.status);
    })
    .slice(0, 4);

  const resolved = resolveTier(account.pointsLifetime, tiers);

  // Build milestone progress only when Sofia has the feature on. The
  // current cycle position = paidOrderCount mod every, the dots-to-fill
  // visualization in the drawer divides by `every` to render N dots.
  const milestone =
    settings.milestoneEnabled && settings.milestoneOrders > 0
      ? {
          paidOrderCount,
          every: settings.milestoneOrders,
          bonusPoints: settings.milestonePoints,
          progress: paidOrderCount % settings.milestoneOrders,
          ordersToNext:
            settings.milestoneOrders -
            (paidOrderCount % settings.milestoneOrders),
        }
      : null;

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
    topRewards,
    topTasks,
    milestone,
  };
}
