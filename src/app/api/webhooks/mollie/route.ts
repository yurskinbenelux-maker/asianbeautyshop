// ─────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/mollie — Mollie payment status callback.
//
// Mollie doesn't sign webhook payloads. The official mitigation (see
// https://docs.mollie.com/overview/webhooks) is to authenticate via an
// unguessable URL. We append ?token=... (MOLLIE_WEBHOOK_SECRET, falling
// back to CRON_SECRET) to the URL we register with Mollie, so anyone
// hitting this route without the right token gets a 401 and a short log
// line and goes away.
//
// The request body is `application/x-www-form-urlencoded` and contains
// just `id=tr_...`. We deliberately don't trust the id — we always
// re-fetch the payment from the Mollie API before mutating anything.
// This is Mollie's own recommendation and means a spoofed id can't drive
// our order state.
//
// Response contract: always return 200 as quickly as possible. Mollie
// retries on non-2xx, and at scale a 500 bounce can produce a pile-up.
// If we can't find the order or Mollie can't find the payment, that's
// fine — log it and ack.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";

import { syncByMollieId } from "@/lib/checkout/sync-mollie";

// Mollie webhooks are unauthenticated (no HMAC), and the body is tiny.
// Force the route to always run on the server runtime, not the edge —
// we reach into Prisma downstream.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function expectedToken(): string {
  return (
    process.env.MOLLIE_WEBHOOK_SECRET || process.env.CRON_SECRET || ""
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Validate the shared-secret token.
  const expected = expectedToken();
  if (expected) {
    const token = req.nextUrl.searchParams.get("token");
    if (token !== expected) {
      console.warn("[mollie-webhook] rejected — bad token");
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } else {
    // No token configured at all. In dev this is fine; in prod this means
    // Sofia deployed without setting CRON_SECRET/MOLLIE_WEBHOOK_SECRET.
    // Log loudly so the issue shows up in server logs.
    console.warn(
      "[mollie-webhook] WARN: no MOLLIE_WEBHOOK_SECRET or CRON_SECRET " +
        "configured — webhook is unauthenticated. Set one in prod.",
    );
  }

  // 2. Parse the body (form-encoded) and pull the payment id.
  let mollieId: string | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      mollieId = params.get("id");
    } else if (contentType.includes("application/json")) {
      // Not Mollie's usual shape, but some reverse proxies convert.
      const body = (await req.json()) as { id?: string };
      mollieId = body.id ?? null;
    } else {
      // Fallback: try both.
      const text = await req.text();
      const params = new URLSearchParams(text);
      mollieId = params.get("id");
    }
  } catch (err) {
    console.warn("[mollie-webhook] failed to parse body", err);
    // Still ack — Mollie shouldn't retry on malformed bodies.
    return new NextResponse("OK", { status: 200 });
  }

  if (!mollieId) {
    console.warn("[mollie-webhook] missing id in body");
    return new NextResponse("OK", { status: 200 });
  }

  // 3. Sync — pulls status from Mollie, updates order, fires emails on
  //    PAID transition. Idempotent, so retries are safe.
  try {
    const result = await syncByMollieId(mollieId);
    if (!result.ok) {
      // Not an error from Mollie's point of view — ack so they don't retry.
      console.warn(
        `[mollie-webhook] sync no-op (${result.reason}) for ${mollieId}`,
      );
    } else if (result.changed) {
      console.log(
        `[mollie-webhook] ${result.publicNumber} → ${result.mollieStatus}`,
      );
    }
  } catch (err) {
    console.error("[mollie-webhook] unexpected error", err);
    // Return 500 in this rare case so Mollie retries — this is a real
    // outage (DB down, etc.), not a bad webhook.
    return new NextResponse("Internal Error", { status: 500 });
  }

  return new NextResponse("OK", { status: 200 });
}

// Mollie occasionally sends a GET on setup/verification. 200-ack is fine.
export async function GET(): Promise<NextResponse> {
  return new NextResponse("OK", { status: 200 });
}
