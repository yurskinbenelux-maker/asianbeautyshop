// ─────────────────────────────────────────────────────────────────────────
// Cron: abandoned-cart nudges.
//
// How to wire on Hostinger:
//   hPanel → Advanced → Cron Jobs → Add new (daily at a sensible hour):
//     0 11 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//                    https://asianbeautyshop.eu/api/cron/abandoned-carts
//
// What it does:
//   • Finds carts that have items, belong to a logged-in user, were
//     updated 4–72 hours ago, haven't been nudged, and whose user hasn't
//     placed an order since that cart was touched.
//   • Sends one localised reminder per cart.
//   • Stamps lastAbandonEmailSentAt on success so we don't re-send.
//   • Bounded batch (50/run).
//
// Requires the Cart.lastAbandonEmailSentAt field — apply via
// `pnpm prisma db push` (or migrate dev) before first run.
//
// Auth: same CRON_SECRET as the other cron routes.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import {
  findAbandonedCarts,
  markAbandonEmailSent,
} from "@/lib/queries/abandoned-carts";
import { sendAbandonedCartEmail } from "@/lib/email/abandoned-cart";

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
    const carts = await findAbandonedCarts();
    const results = {
      considered: carts.length,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    for (const cart of carts) {
      const r = await sendAbandonedCartEmail(cart);
      if (r.sent) {
        try {
          await markAbandonEmailSent(cart.cartId);
        } catch (err) {
          // If stamping fails we'll re-send next run — annoying but not
          // catastrophic. Log loudly.
          console.error(
            `[cron/abandoned-carts] failed to stamp cart ${cart.cartId}`,
            err,
          );
        }
        results.sent += 1;
      } else if (r.reason === "resend-not-configured") {
        // No point continuing — bail out cleanly.
        results.skipped = carts.length - results.sent;
        return NextResponse.json({
          ok: false,
          reason: "resend-not-configured",
          ...results,
        });
      } else {
        results.errors += 1;
        console.warn(
          `[cron/abandoned-carts] send failed for cart ${cart.cartId}: ${r.reason}`,
        );
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("[cron/abandoned-carts] handler error", err);
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
