// ─────────────────────────────────────────────────────────────────────────
// mintBirthdayCoupon — single-use 15%-off code minted by the birthday
// cron the morning of a customer's birthday.
//
// Mirrors the welcome-coupon helper in shape:
//   • Code format: BIRTHDAY-XXXXXXXX (no look-alike chars).
//   • PERCENT, value 15.
//   • maxRedemptions: 1.
//   • endsAt: today + 30 days.
//   • firstOrderOnly: false (returning customers should redeem too —
//     birthday discounts are a thank-you, not an acquisition lever).
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const BIRTHDAY_COUPON_PERCENT = 15;
export const BIRTHDAY_COUPON_VALID_DAYS = 30;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) {
    suffix += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return `BIRTHDAY-${suffix}`;
}

export async function mintBirthdayCoupon(): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + BIRTHDAY_COUPON_VALID_DAYS);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      await prisma.coupon.create({
        data: {
          code,
          kind: "PERCENT",
          value: new Prisma.Decimal(BIRTHDAY_COUPON_PERCENT),
          minSubtotal: null,
          maxRedemptions: 1,
          firstOrderOnly: false,
          isActive: true,
          endsAt: expiresAt,
        },
      });
      return code;
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
  throw new Error("Couldn't mint a unique birthday coupon after 5 attempts.");
}
