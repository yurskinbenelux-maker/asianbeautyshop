// ─────────────────────────────────────────────────────────────────────────
// Quiz-reward server helpers — coupon mint, completion record, cart-restore
// token issue/verify.
//
// All exports are server-only. Client components hit these through server
// actions (see quiz/result-card.tsx and the /quiz/restore page).
//
// Centralised here so the email template, the auth-confirm route, the
// cart action, and the order-placement code all share the same source
// of truth for: coupon code shape, validity window, idempotency rules,
// and the SHA-256 token-hash format.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readPromoSettings } from "@/lib/queries/promotions";

/** Defaults — used as a TS fallback. The authoritative values live in
 *  the Setting row `marketing.promotions`, edited from
 *  /admin/marketing/promotions. Constants are still exported so any
 *  legacy callers compile; new code should call getQuizRewardConfig(). */
export const QUIZ_REWARD_PERCENT = 15;
export const QUIZ_REWARD_VALID_DAYS = 60;

/** Async getter for callers that need the live values — single source
 *  of truth via the central promotions setting. */
export async function getQuizRewardConfig(): Promise<{
  percentOff: number;
  validDays: number;
}> {
  const promo = await readPromoSettings();
  return {
    percentOff: promo.quizRewardPct,
    validDays: promo.quizRewardValidDays,
  };
}

/** Deterministic per-user code. Reusing the same shape as the
 *  registration-welcome coupon so admin can pattern-match across both
 *  in /admin/coupons. */
export function quizCouponCodeForUser(userId: string): string {
  const fragment = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `YUR-QUIZ-${fragment}`;
}

/** Generate a fresh raw cart-restore token + its SHA-256 hash.
 *  The raw token is what goes into the email link; only the hash
 *  is persisted, so a leaked database row can't redeem the discount. */
export function newCartLinkToken(): { raw: string; hash: string } {
  const raw = randomBytes(24).toString("base64url"); // 32 chars URL-safe
  const hash = createHash("sha256").update(raw, "utf8").digest("hex");
  return { raw, hash };
}

/** Hash a token at validation time so we can look up the QuizCompletion
 *  by its hashed value. Same algorithm as newCartLinkToken. */
export function hashCartLinkToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

// ────────── coupon mint (idempotent) ────────────────────────────────────

/** Mint the user's deterministic quiz reward coupon if it doesn't
 *  already exist. Reads the live discount % + validity from the central
 *  promotions setting. Returns the code regardless of whether we
 *  created it now or it already existed. Caller links it to the
 *  QuizCompletion row. */
export async function ensureQuizCoupon(userId: string): Promise<string> {
  const code = quizCouponCodeForUser(userId);
  const existing = await prisma.coupon.findUnique({
    where: { code },
    select: { code: true },
  });
  if (existing) return code;

  const { percentOff, validDays } = await getQuizRewardConfig();
  const expiresAt = expiryFromNow(validDays);

  try {
    await prisma.coupon.create({
      data: {
        code,
        kind: "PERCENT",
        value: new Prisma.Decimal(percentOff),
        minSubtotal: null,
        maxRedemptions: 1,
        firstOrderOnly: false, // quiz reward isn't first-order-only
        isActive: true,
        endsAt: expiresAt,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Race — another tab beat us to it. Fine.
      return code;
    }
    throw err;
  }
  return code;
}

/** Compute an expiry date from now using the current quiz validity
 *  setting. Async because it reads from the promotions setting. */
export async function quizExpiryFromNow(): Promise<Date> {
  const { validDays } = await getQuizRewardConfig();
  return expiryFromNow(validDays);
}

function expiryFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// ────────── completion record (upsert) ──────────────────────────────────

export type RecordCompletionInput = {
  userId: string;
  recommendedProductIds: string[];
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type RecordCompletionResult = {
  /** True if a brand-new completion was created. False if we updated an
   *  existing pre-redemption record (re-took the quiz). */
  created: boolean;
  /** True if the user has already redeemed — record is terminal, no new
   *  email or coupon issued. The caller should suppress the email. */
  alreadyRedeemed: boolean;
  couponCode: string;
  /** Raw token the email link should embed. Null if alreadyRedeemed. */
  cartLinkToken: string | null;
  expiresAt: Date;
};

/** Idempotently upsert a QuizCompletion. Mints (or reuses) the coupon,
 *  rotates the cart-restore token, returns the raw token + metadata so
 *  the caller can fire the welcome email. */
export async function recordQuizCompletion(
  input: RecordCompletionInput,
): Promise<RecordCompletionResult> {
  const couponCode = await ensureQuizCoupon(input.userId);
  const expiresAt = await quizExpiryFromNow();

  const existing = await prisma.quizCompletion.findUnique({
    where: { userId: input.userId },
  });

  // Already redeemed → terminal state. Bump completedAt for analytics
  // but no new token, no email, no coupon refresh.
  if (existing?.redeemedAt) {
    return {
      created: false,
      alreadyRedeemed: true,
      couponCode: existing.couponCode ?? couponCode,
      cartLinkToken: null,
      expiresAt: existing.expiresAt,
    };
  }

  const { raw, hash } = newCartLinkToken();

  if (existing) {
    await prisma.quizCompletion.update({
      where: { userId: input.userId },
      data: {
        couponCode,
        recommendedProductIds: input.recommendedProductIds,
        cartLinkTokenHash: hash,
        expiresAt,
        ipAddress: input.ipAddress ?? existing.ipAddress,
        userAgent: input.userAgent ?? existing.userAgent,
        completedAt: new Date(),
      },
    });
    return {
      created: false,
      alreadyRedeemed: false,
      couponCode,
      cartLinkToken: raw,
      expiresAt,
    };
  }

  await prisma.quizCompletion.create({
    data: {
      userId: input.userId,
      couponCode,
      recommendedProductIds: input.recommendedProductIds,
      cartLinkTokenHash: hash,
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return {
    created: true,
    alreadyRedeemed: false,
    couponCode,
    cartLinkToken: raw,
    expiresAt,
  };
}

// ────────── token verify (used by /quiz/restore) ────────────────────────

export type VerifyTokenResult =
  | { ok: true; userId: string; recommendedProductIds: string[]; expiresAt: Date }
  | { ok: false; reason: "not-found" | "expired" | "redeemed" };

/** Look up a QuizCompletion by raw token from the email link. Returns
 *  the user + recommendation set on success, or a tagged failure so
 *  the route can render a polite error page. */
export async function verifyCartLinkToken(
  rawToken: string,
): Promise<VerifyTokenResult> {
  const hash = hashCartLinkToken(rawToken);
  const row = await prisma.quizCompletion.findUnique({
    where: { cartLinkTokenHash: hash },
    select: {
      userId: true,
      recommendedProductIds: true,
      expiresAt: true,
      redeemedAt: true,
    },
  });
  if (!row) return { ok: false, reason: "not-found" };
  if (row.redeemedAt) return { ok: false, reason: "redeemed" };
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return {
    ok: true,
    userId: row.userId,
    recommendedProductIds: row.recommendedProductIds,
    expiresAt: row.expiresAt,
  };
}

// ────────── redemption (called from order placement) ────────────────────

/** Stamp redeemedAt on the QuizCompletion linked to a coupon code, if
 *  any. Called inside the place-order transaction once the order is
 *  committed and the coupon is the user's quiz reward. Idempotent. */
export async function markQuizRewardRedeemed(
  prismaClient:
    | typeof prisma
    | Prisma.TransactionClient,
  couponCode: string,
): Promise<void> {
  // Coupon → QuizCompletion via the unique couponCode field.
  const completion = await prismaClient.quizCompletion.findFirst({
    where: { couponCode },
    select: { id: true, redeemedAt: true },
  });
  if (!completion || completion.redeemedAt) return;
  await prismaClient.quizCompletion.update({
    where: { id: completion.id },
    data: { redeemedAt: new Date() },
  });
}
