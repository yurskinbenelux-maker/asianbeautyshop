// ─────────────────────────────────────────────────────────────────────────
// Live visitor count — backs the admin "visitors online" widget.
//
// The /api/track endpoint upserts a VisitorPing row per session every
// 60 seconds. Anyone whose lastSeenAt is within the last 2 minutes is
// considered "online". 2 minutes covers a 60s heartbeat plus one missed
// pulse from a slow connection or background tab.
//
// We exclude bots and admins so the number reads as "real people on
// the customer-facing site right now". The Hostinger Max Processes
// ceiling on the Business plan is 120 — when the live count climbs
// past ~50 the widget starts pre-warning an admin visually.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";

const ONLINE_WINDOW_MINUTES = 2;
// Hostinger Business plan ceiling. Hard-coded because there's no
// programmatic way to read it from Hostinger's API. If an admin upgrades
// her plan, she updates this constant + redeploys.
const HOSTINGER_MAX_PROCESSES = 120;
// We get nervous well before the ceiling because Max Processes counts
// EVERY active worker, not just visitor-facing ones (cron jobs, webhook
// handlers, email sends all use slots too). 50 visitors ≈ ~80-100
// processes once you add the supporting workers.
const VISITOR_AMBER_THRESHOLD = 50;
const VISITOR_RED_THRESHOLD = 80;

export type VisitorCount = {
  /** Active human visitors in the last 2 minutes (bots + admins excluded). */
  online: number;
  /** Same window, including bots — useful when debugging "why is the
   *  Max Processes graph spiking but online is 0?" */
  onlineWithBots: number;
  windowMinutes: number;
  /** Hostinger Max Processes ceiling an admin is paying for. */
  hostingerCeiling: number;
  status: "calm" | "amber" | "red";
  /** Top 3 paths visitors are currently on (for the "what's hot" hint). */
  topPaths: { path: string; count: number }[];
};

export async function getVisitorCount(now: Date = new Date()): Promise<VisitorCount> {
  const windowStart = new Date(now.getTime() - ONLINE_WINDOW_MINUTES * 60_000);

  // One query for humans, one for the bot-included total. Both are
  // millisecond-fast on a `(isBot, isAdmin, lastSeenAt)` index.
  const [online, onlineWithBots, topPaths] = await Promise.all([
    prisma.visitorPing.count({
      where: {
        lastSeenAt: { gte: windowStart },
        isBot: false,
        isAdmin: false,
      },
    }),
    prisma.visitorPing.count({
      where: { lastSeenAt: { gte: windowStart } },
    }),
    prisma.visitorPing.groupBy({
      by: ["path"],
      where: {
        lastSeenAt: { gte: windowStart },
        isBot: false,
        isAdmin: false,
      },
      _count: { path: true },
      orderBy: { _count: { path: "desc" } },
      take: 3,
    }),
  ]);

  let status: VisitorCount["status"] = "calm";
  if (online >= VISITOR_RED_THRESHOLD) status = "red";
  else if (online >= VISITOR_AMBER_THRESHOLD) status = "amber";

  return {
    online,
    onlineWithBots,
    windowMinutes: ONLINE_WINDOW_MINUTES,
    hostingerCeiling: HOSTINGER_MAX_PROCESSES,
    status,
    topPaths: topPaths.map((p) => ({ path: p.path, count: p._count.path })),
  };
}
