// ─────────────────────────────────────────────────────────────────────────
// Cron: 7-days-before-expiry coupon reminder.
//
// Wire on cron-job.org — daily, 09:00 Europe/Brussels (after the customer
// is awake but before lunch — best open rates):
//   0 9 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                https://yurskinsolution.eu/api/cron/coupon-expiry-reminder
//
// Walks every Coupon where:
//   · sendExpiryReminder = true       (system-issued, personal)
//   · reminderSentAt IS NULL          (idempotent — only one reminder ever)
//   · isActive = true
//   · redemptionsUsed < maxRedemptions OR maxRedemptions IS NULL
//   · endsAt is between now+(N-0.5)d and now+(N+0.5)d  (where N comes from
//     LoyaltySettings.couponExpiryReminderDays — Sofia tweakable)
//
// For each match, send the localised reminder email and stamp
// `reminderSentAt` so re-runs don't double-email.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { Locale, DiscountKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendCouponExpiryReminderEmail } from "@/lib/email/coupon-expiry-reminder";
import { getLoyaltySettings } from "@/lib/loyalty/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 200;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

/** Build a friendly human label like "10% off your order" or "€5 off". */
function describeCoupon(c: {
  kind: DiscountKind;
  value: { toString(): string };
}): string {
  const v = Number(c.value.toString());
  if (c.kind === "PERCENT") return `${v}% off your order`;
  return `€${v.toFixed(2)} off your order`;
}

async function handle(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const settings = await getLoyaltySettings();
  const N = settings.couponExpiryReminderDays;
  if (N <= 0) {
    return NextResponse.json({
      ok: true,
      considered: 0,
      sent: 0,
      reason: "reminder-disabled",
    });
  }

  // Window is N days from now, ±12h, so a daily run catches every coupon
  // exactly once (no day-boundary misses if the cron ran a few minutes
  // off schedule).
  const now = new Date();
  const target = new Date(now.getTime() + N * 24 * 60 * 60 * 1000);
  const lower = new Date(target.getTime() - 12 * 60 * 60 * 1000);
  const upper = new Date(target.getTime() + 12 * 60 * 60 * 1000);

  const couponRows = await prisma.coupon.findMany({
    where: {
      sendExpiryReminder: true,
      reminderSentAt: null,
      isActive: true,
      userId: { not: null },
      endsAt: { gte: lower, lte: upper },
    },
    take: BATCH_SIZE,
    select: {
      code: true,
      kind: true,
      value: true,
      endsAt: true,
      maxRedemptions: true,
      redemptionsUsed: true,
      user: {
        select: {
          email: true,
          firstName: true,
          preferredLocale: true,
          deletedAt: true,
        },
      },
    },
  });

  // Skip fully-redeemed codes in JS — cleaner than a cross-column SQL
  // expression and the working set here is small (one batch / day).
  const coupons = couponRows.filter(
    (c) => c.maxRedemptions === null || c.redemptionsUsed < c.maxRedemptions,
  );

  const results = {
    considered: coupons.length,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  for (const c of coupons) {
    if (!c.user || c.user.deletedAt) {
      results.skipped += 1;
      continue;
    }

    const daysUntilExpiry = c.endsAt
      ? Math.max(
          1,
          Math.round(
            (c.endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
          ),
        )
      : N;

    const r = await sendCouponExpiryReminderEmail({
      email: c.user.email,
      firstName: c.user.firstName,
      locale: c.user.preferredLocale ?? Locale.EN,
      couponCode: c.code,
      couponLabel: describeCoupon(c),
      daysUntilExpiry,
    });

    if (r.sent) {
      try {
        await prisma.coupon.update({
          where: { code: c.code },
          data: { reminderSentAt: now },
        });
        results.sent += 1;
      } catch (err) {
        console.error(
          "[cron/coupon-expiry-reminder] sent but stamp failed",
          c.code,
          err,
        );
        results.errors += 1;
      }
    } else if (r.reason === "resend-not-configured") {
      return NextResponse.json({
        ok: false,
        reason: "resend-not-configured",
        ...results,
      });
    } else {
      results.errors += 1;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
