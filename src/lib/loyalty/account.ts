// ─────────────────────────────────────────────────────────────────────────
// LoyaltyAccount lifecycle — create on signup, generate referral codes,
// keep the cached `pointsBalance` + `pointsLifetime` in sync with events.
//
// Why we cache balance:
//   The customer drawer reads it on every render. Re-summing every event
//   would mean N+1 queries the moment someone scrolls. We treat the cache
//   as authoritative and the events as the audit trail; the
//   `applyLoyaltyEvent()` helper writes both atomically inside one tx.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  LoyaltyAccount,
  LoyaltyEventKind,
  Prisma,
} from "@prisma/client";

// ────────── referral code generator ──────────────────────────────────────

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — fewer typos
function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Generate a unique referral code shaped like "FIRSTNAME-AB12" so the
 *  customer recognises it as theirs when they share it. Falls back to
 *  "FRIEND-AB12" when the user hasn't provided a first name (was the
 *  legacy "YURSKIN" pre-rebrand — kept brand-neutral on purpose so we
 *  never have to migrate referral codes again on a future rename).
 *  Retries on collision (≈1 in 1M chance for a 6-char tail; collision
 *  still possible if someone picks a really common name and gets unlucky). */
export async function generateReferralCode(opts: {
  firstName: string | null | undefined;
  attempt?: number;
}): Promise<string> {
  const seed = (opts.firstName ?? "FRIEND")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8) || "FRIEND";
  const tail = randomCode(4);
  const code = `${seed}-${tail}`;

  const collision = await prisma.loyaltyAccount.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });
  if (!collision) return code;

  // Up to 5 retries before we throw — collisions are essentially impossible
  // unless the random source is broken.
  const attempt = opts.attempt ?? 0;
  if (attempt >= 5) {
    throw new Error("generateReferralCode: too many collisions");
  }
  return generateReferralCode({ ...opts, attempt: attempt + 1 });
}

// ────────── account auto-create on signup ────────────────────────────────

/** Idempotent: if the user already has an account, returns it; otherwise
 *  creates one with a fresh referral code. Safe to call from the signup
 *  handler, the auth confirm callback, OR the loyalty drawer's first
 *  render — whichever fires first wins.
 *
 *  Side effect on FIRST creation only: fires a "Welcome to the YU.R
 *  Club" email so the customer learns about points + their referral
 *  code. Best-effort — failure is logged but doesn't roll back the
 *  account creation. The healing path (existing account) skips email. */
export async function ensureLoyaltyAccount(opts: {
  userId: string;
  firstName?: string | null;
}): Promise<LoyaltyAccount> {
  const existing = await prisma.loyaltyAccount.findUnique({
    where: { userId: opts.userId },
  });
  if (existing) return existing;

  const referralCode = await generateReferralCode({
    firstName: opts.firstName,
  });

  let created: LoyaltyAccount;
  try {
    created = await prisma.loyaltyAccount.create({
      data: { userId: opts.userId, referralCode },
    });
  } catch (err) {
    // Race: another request created the account between our findUnique
    // and create. Re-read and return that one (no welcome email — the
    // winning request will have sent it).
    const second = await prisma.loyaltyAccount.findUnique({
      where: { userId: opts.userId },
    });
    if (second) return second;
    throw err;
  }

  // Fire the welcome email out-of-band. We dynamically import the email
  // module so this file (which is shared by drawer reads + accrual hooks)
  // doesn't pull in the email machinery on every server render.
  void (async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: opts.userId },
        select: {
          email: true,
          firstName: true,
          preferredLocale: true,
        },
      });
      if (!user) return;
      const { sendLoyaltyClubWelcomeEmail } = await import(
        "@/lib/email/loyalty-club-welcome"
      );
      await sendLoyaltyClubWelcomeEmail({
        email: user.email,
        firstName: user.firstName,
        locale: user.preferredLocale,
        referralCode: created.referralCode,
      });
    } catch (err) {
      console.error("[loyalty/account] welcome email failed", err);
    }
  })();

  return created;
}

// ────────── event application (writes event + bumps cached balance) ──────

/** Append a LoyaltyEvent and sync the cached balance + lifetime in the
 *  same transaction. Returns the updated account so callers can see the
 *  new balance without a round trip.
 *
 *  delta semantics:
 *    · positive  → accrual (always increases pointsBalance + pointsLifetime)
 *    · negative  → spend / clawback / expiry (decreases pointsBalance only;
 *                   pointsLifetime is the "earned ever" odometer)
 *
 *  The atomic tx prevents the cached balance from drifting from the
 *  event log under concurrent accruals + redemptions. */
export async function applyLoyaltyEvent(opts: {
  userId: string;
  kind: LoyaltyEventKind;
  delta: number;
  reason: string;
  orderId?: string;
  couponCode?: string;
  taskClaimId?: string;
  rewardId?: string;
  referralId?: string;
  /** Optional override — when caller already has the account in hand,
   *  saves a SELECT inside the tx. */
  account?: Pick<LoyaltyAccount, "id" | "pointsBalance" | "pointsLifetime">;
  firstName?: string | null;
}): Promise<LoyaltyAccount> {
  const account =
    opts.account ??
    (await ensureLoyaltyAccount({
      userId: opts.userId,
      firstName: opts.firstName ?? null,
    }));

  const balanceDelta = opts.delta;
  const lifetimeDelta = opts.delta > 0 ? opts.delta : 0;

  // Snapshot lifetime BEFORE the increment so we can detect tier-up
  // crossings post-write. Cheap because we already have the cached row.
  const lifetimeBefore = account.pointsLifetime;

  const [updated] = await prisma.$transaction([
    prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        pointsBalance: { increment: balanceDelta },
        pointsLifetime: { increment: lifetimeDelta },
      },
    }),
    prisma.loyaltyEvent.create({
      data: {
        accountId: account.id,
        kind: opts.kind,
        delta: opts.delta,
        reason: opts.reason,
        orderId: opts.orderId,
        couponCode: opts.couponCode,
        taskClaimId: opts.taskClaimId,
        rewardId: opts.rewardId,
        referralId: opts.referralId,
      },
    }),
  ]);

  // Tier-up email — only when the event INCREASED lifetime AND the new
  // lifetime crosses a threshold the customer hadn't hit before.
  // Out-of-band so a Resend hiccup doesn't block the event write.
  if (lifetimeDelta > 0 && updated.pointsLifetime > lifetimeBefore) {
    void (async () => {
      try {
        const { getLoyaltyTiers, resolveTier } = await import("./tiers");
        const tiers = await getLoyaltyTiers();
        const before = resolveTier(lifetimeBefore, tiers);
        const after = resolveTier(updated.pointsLifetime, tiers);
        if (after.current.id === before.current.id) return; // no crossing
        const user = await prisma.user.findUnique({
          where: { id: opts.userId },
          select: {
            email: true,
            firstName: true,
            preferredLocale: true,
          },
        });
        if (!user) return;
        const { sendLoyaltyTierUpEmail } = await import(
          "@/lib/email/loyalty-tier-up"
        );
        await sendLoyaltyTierUpEmail({
          email: user.email,
          firstName: user.firstName,
          locale: user.preferredLocale,
          newTier: after.current.name,
          previousTier: before.current.id === after.current.id
            ? null
            : before.current.name,
        });
      } catch (err) {
        console.error("[loyalty/account] tier-up email failed", err);
      }
    })();
  }

  return updated;
}

// ────────── read helpers ─────────────────────────────────────────────────

export type LoyaltyAccountSummary = {
  pointsBalance: number;
  pointsLifetime: number;
  referralCode: string;
};

/** Read-only snapshot for the drawer hero card. Returns null when the
 *  user doesn't have an account yet — the drawer shouldn't auto-create
 *  one just for being opened, only when the customer takes an action. */
export async function readLoyaltyAccountSummary(
  userId: string,
): Promise<LoyaltyAccountSummary | null> {
  const acc = await prisma.loyaltyAccount.findUnique({
    where: { userId },
    select: {
      pointsBalance: true,
      pointsLifetime: true,
      referralCode: true,
    },
  });
  return acc;
}

/** Recent history for the drawer's "My history" section. Default 50 rows;
 *  the full history page can paginate if an admin ever asks. */
export async function readLoyaltyHistory(opts: {
  userId: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    kind: LoyaltyEventKind;
    delta: number;
    reason: string;
    createdAt: Date;
    orderId: string | null;
    couponCode: string | null;
  }>
> {
  const acc = await prisma.loyaltyAccount.findUnique({
    where: { userId: opts.userId },
    select: { id: true },
  });
  if (!acc) return [];

  const rows = await prisma.loyaltyEvent.findMany({
    where: { accountId: acc.id },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
    select: {
      id: true,
      kind: true,
      delta: true,
      reason: true,
      createdAt: true,
      orderId: true,
      couponCode: true,
    },
  });
  return rows;
}

/** Re-export the Prisma type so consumers don't need a separate import. */
export type { LoyaltyAccount } from "@prisma/client";
