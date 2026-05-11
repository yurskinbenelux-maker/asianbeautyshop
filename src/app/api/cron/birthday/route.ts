// ─────────────────────────────────────────────────────────────────────────
// Cron: birthday emails.
//
// Wire on cron-job.org — daily, 00:05 Europe/Brussels:
//   5 0 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                 https://asianbeautyshop.eu/api/cron/birthday
//
// Walks every customer whose birthday matches today's month/day, mints
// a single-use 15% coupon, sends the localised email, and stamps
// User.lastBirthdayEmailedYear so a re-run on the same day (or a hand-
// fire test) doesn't double-send.
//
// Why year-based sentinel rather than a separate sentEvents table:
//   the operation runs at most once per customer per calendar year and
//   the data is purely informational — a single Int column saves us
//   a join + write per send. Resetting the field manually clears the
//   guard if an admin ever wants to re-test.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendBirthdayEmail } from "@/lib/email/birthday";
import {
  mintBirthdayCoupon,
  BIRTHDAY_COUPON_PERCENT,
} from "@/lib/birthday/coupon";

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

async function handle(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  // Today in Brussels time. We only care about month + day; year
  // changes below decide whether this customer was emailed already.
  const now = new Date();
  const todayMonth = now.getUTCMonth() + 1; // 1-12
  const todayDay = now.getUTCDate();
  const thisYear = now.getUTCFullYear();

  // Postgres date_part is the cleanest filter — pull customers whose
  // birthday matches today's month + day AND (lastBirthdayEmailedYear
  // is null OR is from a previous year). Soft-deleted users are
  // excluded by the `deletedAt` predicate.
  //
  // Raw SQL because Prisma doesn't expose date_part in its query
  // builder. Inputs are integers we control — no injection surface.
  type Row = {
    id: string;
    email: string;
    first_name: string | null;
    preferred_locale: Locale;
  };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT u.id, u.email, u."firstName" as first_name, u."preferredLocale" as preferred_locale
    FROM "User" u
    WHERE u."deletedAt" IS NULL
      AND u.birthday IS NOT NULL
      AND date_part('month', u.birthday) = ${todayMonth}
      AND date_part('day',   u.birthday) = ${todayDay}
      AND (u."lastBirthdayEmailedYear" IS NULL
           OR u."lastBirthdayEmailedYear" < ${thisYear})
    LIMIT ${BATCH_SIZE}
  `;

  const results = {
    considered: rows.length,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  for (const u of rows) {
    let code: string;
    try {
      code = await mintBirthdayCoupon();
    } catch (err) {
      results.errors += 1;
      console.error("[cron/birthday] mint failed", err);
      continue;
    }

    const r = await sendBirthdayEmail({
      email: u.email,
      firstName: u.first_name,
      locale: u.preferred_locale,
      couponCode: code,
      percentOff: BIRTHDAY_COUPON_PERCENT,
    });

    if (r.sent) {
      // Stamp inside the same loop so a restart can resume safely.
      try {
        await prisma.user.update({
          where: { id: u.id },
          data: { lastBirthdayEmailedYear: thisYear },
        });
        results.sent += 1;
      } catch (err) {
        console.error(
          `[cron/birthday] sent but stamp failed for ${u.id}`,
          err,
        );
        results.errors += 1;
      }
    } else if (r.reason === "resend-not-configured") {
      results.skipped = rows.length - results.sent - results.errors;
      return NextResponse.json({
        ok: false,
        reason: "resend-not-configured",
        ...results,
      });
    } else {
      results.errors += 1;
      console.warn(
        `[cron/birthday] send failed for ${u.email}: ${r.reason}`,
      );
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
