// ─────────────────────────────────────────────────────────────────────────
// GET /api/newsletter/unsubscribe?token=...
//
// Matches the `List-Unsubscribe` and footer links we embed in every
// newsletter send. Hashes the token, finds the row, stamps unsubscribedAt.
//
// Always redirects — even on failure we send the user to the friendly
// "unsubscribed" landing rather than an error. From the user's point of
// view, they clicked "unsubscribe" and want out; giving them a dead page
// because their token expired would feel hostile. If the token doesn't
// match, we show the invalid landing instead.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/newsletter/tokens";

function localePath(locale: string | null | undefined, path: string): string {
  const l = (locale ?? "en").toLowerCase();
  const safe = ["en", "nl", "fr", "ru"].includes(l) ? l : "en";
  return `/${safe}${path}`;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const origin = req.nextUrl.origin;
  const invalidUrl = new URL(localePath("en", "/newsletter/invalid"), origin);

  if (!token || token.length < 32 || token.length > 128) {
    return NextResponse.redirect(invalidUrl);
  }

  const sub = await prisma.newsletterSubscriber.findFirst({
    where: { tokenHash: hashToken(token) },
    select: { id: true, locale: true },
  });

  if (!sub) {
    return NextResponse.redirect(invalidUrl);
  }

  await prisma.newsletterSubscriber.update({
    where: { id: sub.id },
    data: {
      unsubscribedAt: new Date(),
      // Burn the token so the link can't be reused.
      tokenHash: null,
    },
  });

  return NextResponse.redirect(
    new URL(localePath(sub.locale, "/newsletter/unsubscribed"), origin),
  );
}

// Mail clients sometimes POST via List-Unsubscribe=One-Click. Handle it
// by just deferring to the same logic.
export async function POST(req: NextRequest) {
  return GET(req);
}
