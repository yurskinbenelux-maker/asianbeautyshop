// ─────────────────────────────────────────────────────────────────────────
// Cron: post-purchase review requests.
//
// How to wire on Hostinger:
//   hPanel → Advanced → Cron Jobs → Add new (daily, any time):
//     0 10 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                    https://asianbeautyshop.eu/api/cron/review-requests
//
// What it does:
//   • Finds orders delivered ≥ 14 days ago that haven't had a
//     review-request email yet (via OrderEvent audit trail).
//   • Sends the localised email per order.
//   • On success, writes an OrderEvent kind="review-request.sent" so
//     the same order is skipped on future runs.
//   • Bounded batch (50 per run) so one run doesn't hammer Resend.
//
// Auth: same CRON_SECRET as /api/cron/low-stock.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import {
  findOrdersDueForReviewRequest,
  markReviewRequestSent,
} from "@/lib/queries/review-requests";
import { sendReviewRequestEmail } from "@/lib/email/review-request";

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
    const candidates = await findOrdersDueForReviewRequest();
    const results = {
      considered: candidates.length,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    // Serial rather than parallel — we're talking to one Resend endpoint
    // and this runs off-peak anyway. Sequential makes logs readable and
    // avoids bursting the rate limit.
    for (const c of candidates) {
      const r = await sendReviewRequestEmail(c.id);
      if (r.sent) {
        // Mark as sent so it's not reconsidered tomorrow. If writing the
        // event fails (unlikely), we'll end up sending again on the next
        // run — preferable to silently dropping.
        try {
          await markReviewRequestSent(c.id, { via: "cron" });
        } catch (err) {
          console.error(
            `[cron/review-requests] failed to mark sent for ${c.publicNumber}`,
            err,
          );
        }
        results.sent += 1;
      } else if (r.reason === "resend-not-configured") {
        // No RESEND_API_KEY — stop trying, we'll just log and move on.
        // Nothing permanent has happened so the next run will pick these up.
        results.skipped = candidates.length - results.sent;
        return NextResponse.json({
          ok: false,
          reason: "resend-not-configured",
          ...results,
        });
      } else {
        results.errors += 1;
        console.warn(
          `[cron/review-requests] send failed for ${c.publicNumber}: ${r.reason}`,
        );
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("[cron/review-requests] handler error", err);
    return NextResponse.json(
      { ok: false, error: "handler-error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
