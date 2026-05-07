// ─────────────────────────────────────────────────────────────────────────
// redeemReward — burn points, mint a coupon, log the event.
//
// All four LoyaltyReward kinds collapse onto the same output shape: a
// per-user single-use Coupon row. an admin gets to design the customer-
// facing variety; the redemption plumbing stays simple:
//
//   COUPON_FIXED   → Coupon kind=FIXED, value=valueEur
//   COUPON_PERCENT → Coupon kind=PERCENT, value=percentOff
//   GIFT_CARD      → Coupon kind=FIXED, value=valueEur
//                    (v1 — uses Coupon table not GiftCard for simplicity;
//                     real gift-card issuance is a Mollie-paid pipeline,
//                     overkill for a points redemption)
//   PRODUCT_FREE   → Coupon kind=FIXED, value=current product price
//                    (customer applies at checkout on a cart containing
//                     that product. Phase F could harden this with a
//                     product-scoped coupon column on Coupon if abuse
//                     becomes a thing.)
//
// Idempotency: not strictly needed because each call mints a unique code
// and the points debit is atomic — but we DO guard against double-debit
// inside the same transaction by using applyLoyaltyEvent's atomic write.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { Prisma, LoyaltyEventKind, Locale } from "@prisma/client";
import type { LoyaltyReward } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { applyLoyaltyEvent } from "./account";

const COUPON_VALID_DAYS = 90;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSuffix(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export type RedeemResult =
  | {
      ok: true;
      couponCode: string;
      pointsCost: number;
      newBalance: number;
      kind: LoyaltyReward["kind"];
    }
  | {
      ok: false;
      reason:
        | "reward-not-found"
        | "reward-inactive"
        | "insufficient-points"
        | "program-paused"
        | "product-missing"
        | "code-collision"
        | "unknown";
      message?: string;
    };

/** Resolve the EUR value to mint a coupon for, depending on reward kind.
 *  Returns null when the reward configuration is incomplete (e.g. a
 *  PRODUCT_FREE reward with a deleted product) — caller maps to a clean
 *  user-facing error. */
async function resolveCouponConfig(
  reward: LoyaltyReward,
): Promise<
  | { kind: "PERCENT"; value: number }
  | { kind: "FIXED"; value: number }
  | null
> {
  switch (reward.kind) {
    case "COUPON_PERCENT":
      if (reward.percentOff == null || reward.percentOff <= 0) return null;
      return { kind: "PERCENT", value: reward.percentOff };

    case "COUPON_FIXED":
    case "GIFT_CARD":
      if (reward.valueCents == null || reward.valueCents <= 0) return null;
      return { kind: "FIXED", value: reward.valueCents / 100 };

    case "PRODUCT_FREE": {
      if (!reward.productId) return null;
      const product = await prisma.product.findUnique({
        where: { id: reward.productId },
        select: { price: true, deletedAt: true },
      });
      if (!product || product.deletedAt) return null;
      return { kind: "FIXED", value: Number(product.price) };
    }
  }
}

function eventKindFor(rewardKind: LoyaltyReward["kind"]): LoyaltyEventKind {
  switch (rewardKind) {
    case "GIFT_CARD":
      return LoyaltyEventKind.REDEEMED_GIFT_CARD;
    case "PRODUCT_FREE":
      return LoyaltyEventKind.REDEEMED_PRODUCT;
    case "COUPON_FIXED":
    case "COUPON_PERCENT":
      return LoyaltyEventKind.REDEEMED_COUPON;
  }
}

export async function redeemReward(opts: {
  userId: string;
  rewardId: string;
  firstName?: string | null;
}): Promise<RedeemResult> {
  // Guard: program-active gate. an admin pausing the programme should also
  // freeze redemptions — otherwise customers can drain balances while
  // she's mid-config.
  const settings = await prisma.loyaltySettings.findFirst();
  if (settings && !settings.isProgramActive) {
    return { ok: false, reason: "program-paused" };
  }

  const reward = await prisma.loyaltyReward.findUnique({
    where: { id: opts.rewardId },
  });
  if (!reward) return { ok: false, reason: "reward-not-found" };
  if (!reward.isActive) return { ok: false, reason: "reward-inactive" };

  const couponConfig = await resolveCouponConfig(reward);
  if (!couponConfig) {
    return { ok: false, reason: "product-missing" };
  }

  // Read account fresh — we'll re-validate inside the transaction below.
  const account = await prisma.loyaltyAccount.findUnique({
    where: { userId: opts.userId },
  });
  if (!account || account.pointsBalance < reward.pointsCost) {
    return { ok: false, reason: "insufficient-points" };
  }

  // Mint the coupon code with retry on collision (≈1 in 32^8 = 1 in 1e12,
  // but the loop is cheap insurance).
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + COUPON_VALID_DAYS);

  let couponCode: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `YUR-LOY-${randomSuffix(8)}`;
    try {
      await prisma.coupon.create({
        data: {
          code: candidate,
          kind: couponConfig.kind,
          value: new Prisma.Decimal(couponConfig.value),
          maxRedemptions: 1,
          isActive: true,
          firstOrderOnly: false,
          endsAt: expiresAt,
          userId: opts.userId,
          sendExpiryReminder: true,
        },
      });
      couponCode = candidate;
      break;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue;
      }
      throw err;
    }
  }

  if (!couponCode) {
    return { ok: false, reason: "code-collision" };
  }

  // Burn the points + log the event. applyLoyaltyEvent runs balance +
  // event in one tx, but we do an extra check first because in the
  // small race-window between read-balance and burn, another redemption
  // could have already burned them.
  const fresh = await prisma.loyaltyAccount.findUnique({
    where: { userId: opts.userId },
    select: { pointsBalance: true },
  });
  if (!fresh || fresh.pointsBalance < reward.pointsCost) {
    // Roll back the coupon we minted — the customer never sees it.
    try {
      await prisma.coupon.delete({ where: { code: couponCode } });
    } catch {
      /* best-effort */
    }
    return { ok: false, reason: "insufficient-points" };
  }

  const updated = await applyLoyaltyEvent({
    userId: opts.userId,
    firstName: opts.firstName,
    kind: eventKindFor(reward.kind),
    delta: -reward.pointsCost,
    reason: `Redeemed: ${reward.title}`,
    couponCode,
    rewardId: reward.id,
  });

  return {
    ok: true,
    couponCode,
    pointsCost: reward.pointsCost,
    newBalance: updated.pointsBalance,
    kind: reward.kind,
  };
}

// ────────── reward catalogue read ────────────────────────────────────────

export type RedeemableReward = {
  id: string;
  title: string;
  description: string | null;
  kind: LoyaltyReward["kind"];
  pointsCost: number;
  /** Pre-formatted "what you get" string for the drawer + redeem page.
   *  Built server-side so the client doesn't need to know about Decimals. */
  valueLabel: string;
  iconKey: string | null;
  productSlug: string | null;
  productName: string | null;
  /** True when the customer's current balance covers the cost. */
  affordable: boolean;
};

/** List active rewards with whether the customer can afford each. The
 *  drawer shows the top N; the /account/club/redeem page shows them all. */
export async function listRedeemableRewards(opts: {
  userId: string;
  locale: Locale;
  limit?: number;
}): Promise<RedeemableReward[]> {
  const [account, rewards] = await Promise.all([
    prisma.loyaltyAccount.findUnique({
      where: { userId: opts.userId },
      select: { pointsBalance: true },
    }),
    prisma.loyaltyReward.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { pointsCost: "asc" }],
      take: opts.limit,
      include: {
        product: {
          select: {
            translations: {
              where: { locale: opts.locale },
              select: { name: true, slug: true },
              take: 1,
            },
          },
        },
      },
    }),
  ]);

  const balance = account?.pointsBalance ?? 0;

  return rewards.map((r) => {
    let valueLabel: string;
    switch (r.kind) {
      case "COUPON_PERCENT":
        valueLabel = `${r.percentOff ?? 0}% off`;
        break;
      case "COUPON_FIXED":
        valueLabel = `€${((r.valueCents ?? 0) / 100).toFixed(0)} off`;
        break;
      case "GIFT_CARD":
        valueLabel = `€${((r.valueCents ?? 0) / 100).toFixed(0)} gift card`;
        break;
      case "PRODUCT_FREE":
        valueLabel =
          r.product?.translations[0]?.name ?? "Free product";
        break;
    }

    return {
      id: r.id,
      title: r.title,
      description: r.description,
      kind: r.kind,
      pointsCost: r.pointsCost,
      valueLabel,
      iconKey: r.iconKey,
      productSlug: r.product?.translations[0]?.slug ?? null,
      productName: r.product?.translations[0]?.name ?? null,
      affordable: balance >= r.pointsCost,
    };
  });
}

/** Fetch one reward fully resolved for the confirmation page. Returns
 *  null when missing/inactive — caller redirects to the catalogue. */
export async function getRedeemableReward(opts: {
  rewardId: string;
  userId: string;
  locale: Locale;
}): Promise<RedeemableReward | null> {
  const reward = await prisma.loyaltyReward.findUnique({
    where: { id: opts.rewardId },
    include: {
      product: {
        select: {
          translations: {
            where: { locale: opts.locale },
            select: { name: true, slug: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!reward || !reward.isActive) return null;

  const account = await prisma.loyaltyAccount.findUnique({
    where: { userId: opts.userId },
    select: { pointsBalance: true },
  });
  const balance = account?.pointsBalance ?? 0;

  let valueLabel: string;
  switch (reward.kind) {
    case "COUPON_PERCENT":
      valueLabel = `${reward.percentOff ?? 0}% off`;
      break;
    case "COUPON_FIXED":
      valueLabel = `€${((reward.valueCents ?? 0) / 100).toFixed(0)} off`;
      break;
    case "GIFT_CARD":
      valueLabel = `€${((reward.valueCents ?? 0) / 100).toFixed(0)} gift card`;
      break;
    case "PRODUCT_FREE":
      valueLabel = reward.product?.translations[0]?.name ?? "Free product";
      break;
  }

  return {
    id: reward.id,
    title: reward.title,
    description: reward.description,
    kind: reward.kind,
    pointsCost: reward.pointsCost,
    valueLabel,
    iconKey: reward.iconKey,
    productSlug: reward.product?.translations[0]?.slug ?? null,
    productName: reward.product?.translations[0]?.name ?? null,
    affordable: balance >= reward.pointsCost,
  };
}
