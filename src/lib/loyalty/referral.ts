// ─────────────────────────────────────────────────────────────────────────
// Referral plumbing — link, mint, award.
//
// Three entry points:
//
//   1. linkReferralAtSignup() — called from /auth/confirm right after the
//      welcome coupon is minted. Resolves the referral code, creates the
//      PENDING Referral row, mints the FRIEND5 coupon for the referee.
//      Idempotent on the (referee, referrer) pair: re-clicks of the
//      confirmation link don't double-create.
//
//   2. awardReferrerOnFirstOrder() — called from sync-mollie's PAID
//      transition. Looks up any PENDING Referral for this customer; if
//      this is genuinely their first paid order, awards the referrer
//      bonus points + flips the row to REWARDED + fires a "your referral
//      worked" email. Wrapped in try/catch upstream so a failure here
//      never rolls back a real-money payment.
//
//   3. validateReferralCodePublic() — used by the sign-up form to give
//      the customer immediate feedback that the code resolves to a real
//      account (without revealing whose). Returns boolean only.
//
// Anti-abuse: a customer can't refer themselves (same email). Self-
// referral attempts at signup are silently ignored (no row created) —
// we don't surface an error because the natural flow is "click a friend's
// link, sign up with the same email by mistake" and we'd rather quietly
// drop the attribution than make the customer feel watched.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { Prisma, ReferralStatus, LoyaltyEventKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { applyLoyaltyEvent } from "./account";
import { getLoyaltySettings } from "./settings";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCouponSuffix(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Sanity check — do we have an account whose referralCode equals this?
 *  Returns true/false only so we don't leak the referrer's identity from
 *  an unauthenticated form. */
export async function validateReferralCodePublic(
  code: string,
): Promise<boolean> {
  const cleaned = code.trim().toUpperCase();
  if (!cleaned) return false;
  const account = await prisma.loyaltyAccount.findUnique({
    where: { referralCode: cleaned },
    select: { id: true },
  });
  return account !== null;
}

// ────────── 1. Link at signup ────────────────────────────────────────────

export async function linkReferralAtSignup(opts: {
  refereeUserId: string;
  refereeEmail: string;
  code: string;
}): Promise<{ ok: boolean; reason?: string; couponCode?: string }> {
  const settings = await getLoyaltySettings();
  if (!settings.isProgramActive) {
    return { ok: false, reason: "program-paused" };
  }

  const cleaned = opts.code.trim().toUpperCase();
  if (!cleaned) return { ok: false, reason: "empty-code" };

  // Resolve referrer.
  const referrerAccount = await prisma.loyaltyAccount.findUnique({
    where: { referralCode: cleaned },
    select: {
      userId: true,
      user: { select: { email: true } },
    },
  });
  if (!referrerAccount) return { ok: false, reason: "code-not-found" };

  // Self-referral guard. Compare by userId AND by email — a customer who
  // typed their own code (or signed up with the same email twice) gets
  // silently dropped.
  if (referrerAccount.userId === opts.refereeUserId) {
    return { ok: false, reason: "self-referral" };
  }
  if (
    referrerAccount.user?.email?.toLowerCase() ===
    opts.refereeEmail.toLowerCase()
  ) {
    return { ok: false, reason: "self-referral" };
  }

  // Idempotency: if a Referral already exists for this (referrer, referee)
  // pair, return its existing coupon code (or null) without re-creating.
  const existing = await prisma.referral.findFirst({
    where: {
      referrerUserId: referrerAccount.userId,
      refereeUserId: opts.refereeUserId,
    },
    select: { id: true, rewardCouponCode: true },
  });
  if (existing) {
    return {
      ok: true,
      couponCode: existing.rewardCouponCode ?? undefined,
      reason: "already-linked",
    };
  }

  // Mint the FRIEND coupon (separate from WELCOME10 by design — Max's
  // brief: don't stack on one cart, drives a second purchase).
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);
  const percent = settings.refereeCouponPercent;

  let couponCode: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `FRIEND${percent}-${randomCouponSuffix(8)}`;
    try {
      await prisma.coupon.create({
        data: {
          code: candidate,
          kind: "PERCENT",
          value: new Prisma.Decimal(percent),
          maxRedemptions: 1,
          isActive: true,
          firstOrderOnly: false,
          endsAt: expiresAt,
          userId: opts.refereeUserId,
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

  // Create the Referral row. We stash the friend coupon code on the row
  // so the email + admin queue can show it. (The schema's
  // `rewardCouponCode` field was originally for the legacy
  // referrer-coupon model; we now use it for the referee coupon since
  // the referrer is rewarded with points instead.)
  await prisma.referral.create({
    data: {
      referrerUserId: referrerAccount.userId,
      refereeUserId: opts.refereeUserId,
      refereeEmail: opts.refereeEmail.toLowerCase(),
      status: ReferralStatus.PENDING,
      rewardCouponCode: couponCode,
    },
  });

  return { ok: true, couponCode: couponCode ?? undefined };
}

// ────────── 2. Award referrer on first paid order ────────────────────────

export async function awardReferrerOnFirstOrder(opts: {
  refereeUserId: string;
  orderId: string;
}): Promise<{ awarded: boolean; reason?: string }> {
  const settings = await getLoyaltySettings();
  if (!settings.isProgramActive) {
    return { awarded: false, reason: "program-paused" };
  }

  // Find the PENDING referral targeting this customer. Most customers
  // never have one; we exit fast on the null path.
  const referral = await prisma.referral.findFirst({
    where: {
      refereeUserId: opts.refereeUserId,
      status: ReferralStatus.PENDING,
    },
    include: {
      referrer: { select: { firstName: true } },
    },
  });
  if (!referral) return { awarded: false, reason: "no-pending-referral" };

  // First-order check — count the customer's PAID orders. The freshly
  // flipped order has paymentStatus=PAID by the time sync-mollie calls
  // us, so the count includes it. Award only when this is the first.
  const paidCount = await prisma.order.count({
    where: { userId: opts.refereeUserId, paymentStatus: "PAID" },
  });
  if (paidCount > 1) {
    // They've ordered before — referral attribution doesn't fire on
    // every subsequent order. We still flip the status though, so the
    // PENDING row doesn't sit forever.
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: ReferralStatus.CANCELLED,
        rewardedAt: new Date(),
      },
    });
    return { awarded: false, reason: "not-first-order" };
  }

  const points = settings.referrerBonus;

  await applyLoyaltyEvent({
    userId: referral.referrerUserId,
    firstName: referral.referrer?.firstName,
    kind: LoyaltyEventKind.EARNED_REFERRAL,
    delta: points,
    reason: `Referral reward — ${referral.refereeEmail}`,
    referralId: referral.id,
    orderId: opts.orderId,
  });

  await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: ReferralStatus.REWARDED,
      refereeOrderId: opts.orderId,
      rewardedAt: new Date(),
    },
  });

  return { awarded: true };
}
