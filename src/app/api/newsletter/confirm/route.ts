// ─────────────────────────────────────────────────────────────────────────
// GET /api/newsletter/confirm?token=...
//
// Handler for the link in the confirmation email. Hashes the token, finds
// the matching subscriber row, stamps confirmedAt, and rotates the token
// (the confirmed row will reuse tokenHash for one-click unsubscribe links).
//
// Redirects to /{locale}/newsletter/confirmed on success, or
// /{locale}/newsletter/invalid on any failure. We never render an error
// inline — keeps the surface simple and keeps users on the brand site.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/newsletter/tokens";
import {
  mintWelcomeCoupon,
  WELCOME_COUPON_PERCENT,
} from "@/lib/newsletter/welcome-coupon";
import { sendNewsletterWelcomeEmail } from "@/lib/email/newsletter-welcome";

function localePath(locale: string | null | undefined, path: string): string {
  const l = (locale ?? "en").toLowerCase();
  const safe = ["en", "nl", "fr", "ru"].includes(l) ? l : "en";
  return `/${safe}${path}`;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const origin = req.nextUrl.origin;

  // Default "bad link" landing if anything goes sideways.
  const invalidUrl = new URL(localePath("en", "/newsletter/invalid"), origin);

  if (!token || token.length < 32 || token.length > 128) {
    return NextResponse.redirect(invalidUrl);
  }

  const sub = await prisma.newsletterSubscriber.findFirst({
    where: { tokenHash: hashToken(token) },
    select: { id: true, email: true, locale: true, confirmedAt: true },
  });

  if (!sub) {
    return NextResponse.redirect(invalidUrl);
  }

  // Detect a genuine first-time confirmation. Re-clicking the link
  // (or someone forwarding it to a friend) reuses the same token and
  // we don't want to mint a fresh coupon on every replay.
  const isFirstConfirm = sub.confirmedAt === null;

  // Rotate the token so the confirm link can't be reused, and stamp the
  // confirmedAt timestamp. The new tokenHash will be embedded in future
  // newsletter sends for one-click unsubscribe.
  const newToken = generateToken();
  await prisma.newsletterSubscriber.update({
    where: { id: sub.id },
    data: {
      confirmedAt: sub.confirmedAt ?? new Date(),
      unsubscribedAt: null,
      tokenHash: hashToken(newToken),
    },
  });

  // First-time confirm → mint a single-use 10% coupon and send the
  // welcome email. Any failure here is non-blocking: we still want
  // the user to land on /newsletter/confirmed even if Resend is down.
  if (isFirstConfirm) {
    void mintAndSendWelcome({
      email: sub.email,
      locale: (sub.locale as Locale | null) ?? Locale.EN,
    });
  }

  const confirmedUrl = new URL(
    localePath(sub.locale, "/newsletter/confirmed"),
    origin,
  );
  return NextResponse.redirect(confirmedUrl);
}

/**
 * Mint a fresh single-use coupon and send the welcome email. Wrapped
 * in its own function so the redirect path stays clean and so any
 * failure can be caught + logged without blocking the redirect.
 */
async function mintAndSendWelcome(args: {
  email: string;
  locale: Locale;
}): Promise<void> {
  try {
    const couponCode = await mintWelcomeCoupon();
    await sendNewsletterWelcomeEmail({
      email: args.email,
      locale: args.locale,
      couponCode,
      percentOff: WELCOME_COUPON_PERCENT,
    });
  } catch (err) {
    console.error(
      "[newsletter/confirm] failed to mint+send welcome",
      err,
    );
  }
}
