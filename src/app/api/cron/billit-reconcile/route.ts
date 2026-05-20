// ─────────────────────────────────────────────────────────────────────────
// Cron: daily Billit reconciliation sweep + digest email.
//
// How to wire on cron-job.org (one entry, daily):
//   URL:     https://asianbeautyshop.eu/api/cron/billit-reconcile
//   Header:  Authorization: Bearer <CRON_SECRET>
//   Schedule: 0 9 * * *   (09:00 Europe/Brussels — first thing in the
//                          morning, before any new orders pile up that
//                          day. Pick anything sensible; the body of work
//                          is identical regardless of time of day.)
//
// What it does:
//   1. Runs runBillitReconcileSweep() — retries any unpushed rows in the
//      last 30 days (capped at MAX_ATTEMPTS), surfaces mismatches +
//      stuck-failures in the last 90 days.
//   2. Sends a digest email to ADMIN_NOTIFICATION_EMAIL — every day,
//      including "all clear" days (heartbeat principle: silence is bad
//      for compliance work, so we err toward noisy).
//
// No-op-safe: if BILLIT_* env vars aren't set yet (current state until
// K'Elmus ships the PartyID), the sweep returns {configured: false} and
// no email goes out.
//
// Auth: shared CRON_SECRET (same pattern as the other /api/cron/* routes).
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { runBillitReconcileSweep } from "@/lib/invoices/billit/reconcile-sweep";
import { sendBillitDigest } from "@/lib/email/billit-digest";

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

  try {
    const report = await runBillitReconcileSweep();

    // sendBillitDigest is no-op when report.configured === false, so we
    // can call it unconditionally. Errors inside the send are logged but
    // don't fail the cron — the sweep itself already happened.
    const send = await sendBillitDigest(report);

    return NextResponse.json({
      ok: true,
      configured: report.configured,
      retried: report.retried,
      newlyPushed: report.newlyPushed,
      stillPending: report.stillPending,
      mismatches: report.mismatches.length,
      stuckFailures: report.stuckFailures.length,
      digestSent: send.sent,
      digestReason: send.reason ?? null,
    });
  } catch (err) {
    console.error("[cron/billit-reconcile] unexpected error", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

// Both GET and POST are accepted — cron-job.org defaults to GET, but
// curl-based crons sometimes POST. Same handler either way; this is a
// read-then-side-effect endpoint, not a true REST resource.
export const GET = handle;
export const POST = handle;
