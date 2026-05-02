// ─────────────────────────────────────────────────────────────────────────
// Cron: replenishment reminders.
//
// Wire on cron-job.org — daily at a quiet hour:
//   0 9 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                 https://yurskinsolution.eu/api/cron/replenishment
//
// Finds orders delivered 45-90 days ago whose customer hasn't reordered,
// sends each a localised "running out?" email, and stamps an OrderEvent
// kind="replenishment.sent" so the same order is never reminded twice.
//
// Sequential processing (not parallel) — Resend rate-limit friendly +
// makes logs scannable. Bounded batch (50 per run); a backlog catches
// up over multiple days naturally.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import {
  findOrdersDueForReplenishment,
  markReplenishmentSent,
} from "@/lib/queries/replenishment";
import { sendReplenishmentEmail } from "@/lib/email/replenishment";

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
    const candidates = await findOrdersDueForReplenishment();
    const results = {
      considered: candidates.length,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    for (const c of candidates) {
      const r = await sendReplenishmentEmail(c.id);
      if (r.sent) {
        try {
          await markReplenishmentSent(c.id, { via: "cron" });
        } catch (err) {
          console.error(
            `[cron/replenishment] sent but stamp failed for ${c.publicNumber}`,
            err,
          );
        }
        results.sent += 1;
      } else if (r.reason === "resend-not-configured") {
        results.skipped = candidates.length - results.sent;
        return NextResponse.json({
          ok: false,
          reason: "resend-not-configured",
          ...results,
        });
      } else {
        results.errors += 1;
        console.warn(
          `[cron/replenishment] send failed for ${c.publicNumber}: ${r.reason}`,
        );
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("[cron/replenishment] handler error", err);
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
