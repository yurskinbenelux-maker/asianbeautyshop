// ─────────────────────────────────────────────────────────────────────────
// Cron: daily low-stock digest.
//
// How to wire on Hostinger:
//   hPanel → Advanced → Cron Jobs → Add new:
//     0 9 * * *    curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                    https://yurskinsolution.eu/api/cron/low-stock
//   (Runs at 09:00 CET daily. Pick a time that fits Sofia's morning.)
//
// Auth:
//   • In prod: `Authorization: Bearer <CRON_SECRET>` OR `?secret=<CRON_SECRET>`.
//     Without a valid secret → 401. Without CRON_SECRET configured at all,
//     the route still requires *some* auth (refuses unprotected access)
//     to avoid accidentally leaking an endpoint that triggers emails.
//   • For local dev, set CRON_SECRET=dev-secret in .env.local and hit the
//     endpoint with that value.
//
// Emits:
//   • Empty report → 200 {"sent":false,"reason":"nothing-to-report"}
//   • Non-empty → 200 {"sent":true,"count":N} plus an email to
//     ADMIN_NOTIFICATION_EMAIL.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getLowStockReport } from "@/lib/queries/low-stock";
import { sendLowStockAlert } from "@/lib/email/low-stock-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured = refuse. Better to 401 and log than to
    // silently allow unauthenticated access to a side-effecting endpoint.
    return false;
  }

  // Accept either `Authorization: Bearer <secret>` or `?secret=<secret>`.
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

async function handle(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  try {
    const report = await getLowStockReport();
    const result = await sendLowStockAlert(report);
    return NextResponse.json({
      ok: true,
      threshold: report.threshold,
      ...result,
    });
  } catch (err) {
    console.error("[cron/low-stock] handler error", err);
    return NextResponse.json(
      { ok: false, error: "handler-error" },
      { status: 500 },
    );
  }
}

// Accept both GET (simple curl) and POST (in case a scheduler prefers it).
export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
