// ─────────────────────────────────────────────────────────────────────────
// Cron: refresh the Instagram post cache from the Graph API.
//
// Wire on cron-job.org — every 4 hours is plenty (IG posting cadence
// is daily at most for most brands; 4h gives near-real-time without
// burning rate limit):
//
//   0 */4 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                  https://yurskinsolution.eu/api/cron/instagram-sync
//
// Returns JSON describing what happened so cron-job.org's success
// detection works (200 + ok:true) and the dashboard email notifications
// surface the count.
//
// Auth: same pattern as the other cron endpoints — Bearer token in the
// Authorization header (or `?secret=` query param). The secret comes
// from env var CRON_SECRET, which is already set in Hostinger prod.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { syncInstagramPosts } from "@/lib/instagram/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const result = await syncInstagramPosts();

  if (!result.ok) {
    // Return 200 even on logical failure so cron-job.org doesn't
    // spam Sofia with retries — the error is recorded in the
    // Setting table and surfaces in admin.
    return NextResponse.json({
      ok: false,
      error: result.error,
      durationMs: result.durationMs,
    });
  }

  return NextResponse.json({
    ok: true,
    fetched: result.fetched,
    upserted: result.upserted,
    durationMs: result.durationMs,
  });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
