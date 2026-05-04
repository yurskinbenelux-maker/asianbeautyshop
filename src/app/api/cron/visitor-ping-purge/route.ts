// ─────────────────────────────────────────────────────────────────────────
// GET /api/cron/visitor-ping-purge — daily housekeeping for the
// VisitorPing table.
//
// Pings older than 24 hours are useless — the live-visitors widget only
// looks at the last 2 minutes, and we don't keep historical analytics
// from this table (Plausible/GA4 will own that when they're added). We
// purge the rest so the table doesn't grow unbounded.
//
// At 5,000 visitors/day a row each, the table would otherwise grow by
// ~1.5M rows/year. Daily purge keeps it under ~10K rows at any time.
//
// Schedule via Hostinger cron jobs:
//   0 4 * * *   GET https://yurskinsolution.eu/api/cron/visitor-ping-purge
//   Header:     x-cron-secret: $CRON_SECRET
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Same secret-header pattern every other cron uses — see
  // src/app/api/cron/* for the convention.
  const provided = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.visitorPing.deleteMany({
    where: { lastSeenAt: { lt: cutoff } },
  });

  return NextResponse.json({ deleted: count });
}
