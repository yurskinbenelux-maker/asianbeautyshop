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
// Schedule via cron-job.org:
//   0 4 * * *   GET https://yurskinsolution.eu/api/cron/visitor-ping-purge
//   Header:     Authorization: Bearer $CRON_SECRET
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Authorization: Bearer <CRON_SECRET> — matches the convention used by
  // every other route under /api/cron/* (low-stock, abandoned-carts,
  // replenishment, birthday, etc.). The shared helper would be nice
  // long-term; for now we inline the check.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.visitorPing.deleteMany({
    where: { lastSeenAt: { lt: cutoff } },
  });

  return NextResponse.json({ deleted: count });
}
