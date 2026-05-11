// ─────────────────────────────────────────────────────────────────────────
// Cron: A-Beauty Club birthday points award.
//
// Wire on cron-job.org — daily, 00:15 Europe/Brussels (offset slightly
// after the existing /api/cron/birthday so the EMAIL goes first, points
// follow):
//   15 0 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                 https://asianbeautyshop.eu/api/cron/loyalty-birthday
//
// Walks every customer whose birthday matches today's month/day and
// hasn't been awarded yet this calendar year, fires `accrueBirthday()`
// for each. The award is idempotent via User.lastBirthdayLoyaltyYear,
// independent of the email sentinel, so a re-run never double-awards.
//
// Why a separate cron from the email cron:
//   The email cron (#114) was already shipped + tested — touching it
//   risks a regression. A new endpoint also lets an admin disable the
//   loyalty award without disabling the email by simply removing this
//   schedule from cron-job.org.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accrueBirthday } from "@/lib/loyalty/accrue";
import { isLoyaltyProgramActive } from "@/lib/loyalty/settings";

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

  if (!(await isLoyaltyProgramActive())) {
    return NextResponse.json({
      ok: true,
      considered: 0,
      awarded: 0,
      skipped: 0,
      reason: "program-paused",
    });
  }

  const now = new Date();
  const todayMonth = now.getUTCMonth() + 1;
  const todayDay = now.getUTCDate();
  const thisYear = now.getUTCFullYear();

  // Same Postgres date_part filter as the email cron, but selecting on the
  // independent loyalty-year sentinel.
  type Row = {
    id: string;
    first_name: string | null;
  };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT u.id, u."firstName" as first_name
    FROM "User" u
    WHERE u."deletedAt" IS NULL
      AND u.birthday IS NOT NULL
      AND date_part('month', u.birthday) = ${todayMonth}
      AND date_part('day',   u.birthday) = ${todayDay}
      AND (u."lastBirthdayLoyaltyYear" IS NULL
           OR u."lastBirthdayLoyaltyYear" < ${thisYear})
    LIMIT ${BATCH_SIZE}
  `;

  const results = {
    considered: rows.length,
    awarded: 0,
    skipped: 0,
    errors: 0,
  };

  for (const u of rows) {
    try {
      const r = await accrueBirthday({
        userId: u.id,
        firstName: u.first_name,
        thisYear,
      });
      if (r.skipped) {
        results.skipped += 1;
      } else {
        results.awarded += 1;
      }
    } catch (err) {
      console.error("[cron/loyalty-birthday] accrueBirthday failed", u.id, err);
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
