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
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/newsletter/tokens";
// Newsletter does NOT carry a coupon. The single-use discount incentive
// lives on account registration (see /lib/coupons/registration-welcome.ts
// + the homepage RegisterWelcomePopup) and on quiz completion. The
// newsletter is a pure subscriber list — we capture the email, confirm
// it, and add the row. No follow-up email beyond confirmation; no
// welcome coupon. The historical mintWelcomeCoupon helper and
// sendNewsletterWelcomeEmail template were removed when this incentive
// model was finalised.

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

  const confirmedUrl = new URL(
    localePath(sub.locale, "/newsletter/confirmed"),
    origin,
  );
  return NextResponse.redirect(confirmedUrl);
}
