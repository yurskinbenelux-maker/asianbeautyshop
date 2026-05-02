// ─────────────────────────────────────────────────────────────────────────
// Gift card data helpers — the gateway for issue / lookup / redemption.
//
// Convention:
//   • Codes look like GIFT-XXXXXXXX (8 chars, no-look-alikes alphabet).
//   • Balance is decremented at redemption time inside a transaction so
//     two simultaneous orders can't double-spend the same card.
//   • A redemption is an idempotent (giftCardId, orderId) pair — re-running
//     the apply path on the same order doesn't double-decrement.
//   • Status is recomputed on every mutation so admin filters stay cheap.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { GiftCardStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Avoid 0/O/1/I — readable in monospace + on phone screens. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const GIFT_CODE_PREFIX = "GIFT-";
const DEFAULT_EXPIRY_DAYS = 365;

function randomCode(): string {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) {
    suffix += CODE_ALPHABET.charAt(
      Math.floor(Math.random() * CODE_ALPHABET.length),
    );
  }
  return `${GIFT_CODE_PREFIX}${suffix}`;
}

export type IssueGiftCardInput = {
  amountEur: number;
  recipientEmail: string;
  recipientName?: string | null;
  senderName?: string | null;
  message?: string | null;
  expiresInDays?: number;
  /** Optional — set when the card is bought through a customer order. */
  purchaseOrderId?: string | null;
};

/** Generate a unique GIFT- code + persist a fresh GiftCard row. */
export async function issueGiftCard(input: IssueGiftCardInput): Promise<{
  id: string;
  code: string;
}> {
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + (input.expiresInDays ?? DEFAULT_EXPIRY_DAYS),
  );
  const value = new Prisma.Decimal(input.amountEur.toFixed(2));

  // Retry on the (vanishingly rare) collision — 1 trillion 8-char strings.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    try {
      const created = await prisma.giftCard.create({
        data: {
          code,
          initialBalance: value,
          balance: value,
          status: GiftCardStatus.ACTIVE,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName ?? null,
          senderName: input.senderName ?? null,
          message: input.message ?? null,
          expiresAt,
          purchaseOrderId: input.purchaseOrderId ?? null,
        },
        select: { id: true, code: true },
      });
      return created;
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
  throw new Error("Couldn't mint a unique gift-card code after 5 attempts.");
}

export type LookupResult =
  | { ok: true; id: string; balance: number; status: GiftCardStatus; expiresAt: Date | null }
  | { ok: false; reason: "not-found" | "void" | "expired" | "depleted" };

/** Validate a gift-card code at apply time. Idempotent + read-only. */
export async function lookupGiftCard(rawCode: string): Promise<LookupResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code.startsWith(GIFT_CODE_PREFIX)) return { ok: false, reason: "not-found" };

  const card = await prisma.giftCard.findUnique({
    where: { code },
    select: {
      id: true,
      balance: true,
      status: true,
      expiresAt: true,
    },
  });
  if (!card) return { ok: false, reason: "not-found" };
  if (card.status === GiftCardStatus.VOID) return { ok: false, reason: "void" };

  // Lazy-expire: if the row missed the cron sweep, downgrade now.
  if (card.expiresAt && card.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (Number(card.balance) <= 0 || card.status === GiftCardStatus.DEPLETED) {
    return { ok: false, reason: "depleted" };
  }

  return {
    ok: true,
    id: card.id,
    balance: Number(card.balance),
    status: card.status,
    expiresAt: card.expiresAt,
  };
}

/**
 * Apply a gift card to an order, atomically. Decrements the balance
 * by the smaller of (orderTotalEur, currentBalance) and writes a
 * GiftCardRedemption row keyed on (giftCardId, orderId).
 *
 * Idempotent — re-applying to the same order is a no-op (returns the
 * previous redemption amount).
 */
export async function applyGiftCardToOrder(args: {
  giftCardId: string;
  orderId: string;
  orderTotalEur: number;
}): Promise<
  | { ok: true; amountUsedEur: number; remainingBalanceEur: number }
  | { ok: false; reason: "card-gone" | "already-applied" | "depleted" }
> {
  return prisma.$transaction(async (tx) => {
    const card = await tx.giftCard.findUnique({
      where: { id: args.giftCardId },
      select: { id: true, balance: true, status: true, expiresAt: true },
    });
    if (!card) return { ok: false as const, reason: "card-gone" as const };
    if (card.status === "VOID")
      return { ok: false as const, reason: "card-gone" as const };
    if (card.expiresAt && card.expiresAt.getTime() < Date.now())
      return { ok: false as const, reason: "depleted" as const };
    const balance = Number(card.balance);
    if (balance <= 0)
      return { ok: false as const, reason: "depleted" as const };

    // Idempotency check — returns the existing redemption if any.
    const existing = await tx.giftCardRedemption.findUnique({
      where: {
        giftCardId_orderId: {
          giftCardId: args.giftCardId,
          orderId: args.orderId,
        },
      },
      select: { amountUsed: true },
    });
    if (existing) {
      return {
        ok: true as const,
        amountUsedEur: Number(existing.amountUsed),
        remainingBalanceEur: balance,
      };
    }

    const amountUsed = Math.min(args.orderTotalEur, balance);
    const remaining = balance - amountUsed;

    await tx.giftCardRedemption.create({
      data: {
        giftCardId: args.giftCardId,
        orderId: args.orderId,
        amountUsed: new Prisma.Decimal(amountUsed.toFixed(2)),
      },
    });
    await tx.giftCard.update({
      where: { id: args.giftCardId },
      data: {
        balance: new Prisma.Decimal(remaining.toFixed(2)),
        status:
          remaining <= 0 ? GiftCardStatus.DEPLETED : GiftCardStatus.ACTIVE,
      },
    });

    return {
      ok: true as const,
      amountUsedEur: amountUsed,
      remainingBalanceEur: remaining,
    };
  });
}
