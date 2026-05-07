// ─────────────────────────────────────────────────────────────────────────
// issueRegistrationWelcomeCoupon — mints a single-use 10%-off coupon for
// a freshly-confirmed Asian Beauty Shop account holder, then emails it to them.
//
// Replaces the older newsletter-confirmation coupon flow: the 10% offer
// now rewards account creation, not the newsletter list. The popup on
// the homepage CTA leads here through the standard signup flow.
//
// Idempotency:
//   The coupon code is deterministic — `YUR-WELCOME-{first 8 chars of
//   user.id, uppercase}`. If the same user re-clicks their confirmation
//   email (or refreshes /auth/confirm) we look the row up, see it
//   exists, and quietly skip. No double-issuance, no double-email,
//   without needing a new column on the User model.
//
// Conventions (kept in sync with the older mintWelcomeCoupon):
//   · 10% off (PERCENT, value 10)
//   · single-use (maxRedemptions = 1)
//   · 60-day validity
//   · firstOrderOnly = true
//
// Failures in either the DB write or the email send are logged but
// non-blocking — the verifyOtp redirect must always succeed so the
// customer doesn't get bounced to /sign-in?error=… on what should be a
// celebratory moment.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendRegistrationWelcomeEmail } from "@/lib/email/registration-welcome";
import { readPromoSettings } from "@/lib/queries/promotions";

/** Defaults — used as a TS fallback if the settings read fails. The
 *  authoritative values live in the Setting row `marketing.promotions`,
 *  edited from /admin/marketing/promotions. The constants are still
 *  exported in case any older code paths reference them. */
export const REGISTRATION_COUPON_PERCENT = 10;
export const REGISTRATION_COUPON_VALID_DAYS = 60;

/** Deterministic per-user code. Length stays under 24 chars so it fits
 *  any sane "Promo code" input. UUID prefix is enough collision-room
 *  for a single brand's customer base. */
function codeForUser(userId: string): string {
  const fragment = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `YUR-WELCOME-${fragment}`;
}

export async function issueRegistrationWelcomeCoupon(args: {
  userId: string;
  email: string;
}): Promise<void> {
  const code = codeForUser(args.userId);

  // Fast path — coupon already minted for this user, nothing to do.
  // (Repeat clicks on a confirmation link, page refreshes etc.)
  const existing = await prisma.coupon.findUnique({
    where: { code },
    select: { code: true },
  });
  if (existing) return;

  // Read the live discount % + validity from the central promotions
  // setting (admin-editable). On any failure the helper falls back to
  // PROMO_DEFAULTS so this call path can never block on a missing row.
  const promo = await readPromoSettings();
  const percentOff = promo.registrationWelcomePct;
  const validDays = promo.registrationWelcomeValidDays;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validDays);

  try {
    await prisma.coupon.create({
      data: {
        code,
        kind: "PERCENT",
        value: new Prisma.Decimal(percentOff),
        minSubtotal: null,
        maxRedemptions: 1,
        firstOrderOnly: true,
        isActive: true,
        endsAt: expiresAt,
      },
    });
  } catch (err) {
    // P2002 — race: another tab beat us to it. Treat as success and
    // skip the email send so we don't double-deliver.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return;
    }
    throw err;
  }

  // Email is best-effort — the customer can also see the code on
  // /account if an admin surfaces it there later. Logging the failure is
  // enough for now.
  try {
    await sendRegistrationWelcomeEmail({
      email: args.email,
      couponCode: code,
      percentOff,
      validDays,
    });
  } catch (err) {
    console.error("[registration-welcome] email failed", err);
  }
}
