// ─────────────────────────────────────────────────────────────────────────
// mintWelcomeCoupon — creates a single-use 10%-off coupon for a freshly
// confirmed newsletter subscriber. Called from the /api/newsletter/confirm
// route once we know the row genuinely transitioned from pending → confirmed
// (we don't want to spam coupons on every re-confirm click).
//
// Convention:
//   • code shape: WELCOME-XXXXXXXX (uppercase, 8 random alphanum chars)
//   • kind:       PERCENT, value 10
//   • maxRedemptions: 1
//   • endsAt:     now + 60 days
//   • firstOrderOnly: true (admin can override later if Sofia wants
//     returning customers to redeem too)
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** % off for the welcome coupon. Centralised so the email + DB row stay in sync. */
export const WELCOME_COUPON_PERCENT = 10;
export const WELCOME_COUPON_VALID_DAYS = 60;

/** Generate WELCOME-XXXXXXXX with 8 chars from a no-look-alikes alphabet. */
function generateCode(): string {
  // Skip 0/O/1/I to keep the code readable in monospace + on phone screens.
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 8; i += 1) {
    suffix += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return `WELCOME-${suffix}`;
}

export async function mintWelcomeCoupon(): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + WELCOME_COUPON_VALID_DAYS);

  // Retry on the (extremely unlikely) collision — the alphabet has
  // ~1 trillion 8-char strings, but defensive code is cheap.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      await prisma.coupon.create({
        data: {
          code,
          kind: "PERCENT",
          value: new Prisma.Decimal(WELCOME_COUPON_PERCENT),
          minSubtotal: null,
          maxRedemptions: 1,
          firstOrderOnly: true,
          isActive: true,
          endsAt: expiresAt,
        },
      });
      return code;
    } catch (err) {
      // P2002 is Prisma's unique-constraint-violation code. Anything
      // else is real — bubble up.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Couldn't mint a unique welcome coupon after 5 attempts.");
}
