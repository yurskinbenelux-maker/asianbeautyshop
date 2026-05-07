// ─────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/sendcloud — Sendcloud webhook receiver.
//
// Configure in Sendcloud panel → Settings → Integrations → your
// integration → enable "Webhook feedback" + paste this URL:
//   https://asianbeautyshop.eu/api/webhooks/sendcloud
//
// Sendcloud signs every payload with HMAC-SHA256 over the raw request
// body, using the **same Secret Key** that powers the API auth — there
// is no separate webhook secret in their UI. We read SENDCLOUD_SECRET_KEY
// for verification, with SENDCLOUD_WEBHOOK_SECRET as an optional override
// in case an admin ever wants distinct keys (rare; supported for flexibility).
// Signature arrives in the `Sendcloud-Signature` header (lowercase hex).
//
// We respond 200 to *any* signed payload, even ones we don't recognise
// or whose order we can't find. Sendcloud retries on non-2xx; a wrong
// 500 here pulls an admin into noisy webhook retries.
//
// State changes:
//   • status bucket "in_transit"  → Order.status = SHIPPED + send shipped email
//   • status bucket "delivered"   → Order.status = DELIVERED
//   • everything else             → log + ack, no DB write
// ─────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendOrderShippedEmail } from "@/lib/email/order-shipped";
import {
  bucketForStatusId,
  nextOrderStatusForBucket,
} from "@/lib/sendcloud/status-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify the HMAC signature Sendcloud sends in the `Sendcloud-Signature`
 * header. Sendcloud signs with the integration's API Secret Key — same
 * value used for HTTP Basic auth. We accept SENDCLOUD_WEBHOOK_SECRET
 * as an optional override but fall back to SENDCLOUD_SECRET_KEY,
 * which is what the platform actually uses today. Constant-time compare
 * to avoid leaking the signature byte-by-byte.
 */
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret =
    process.env.SENDCLOUD_WEBHOOK_SECRET || process.env.SENDCLOUD_SECRET_KEY;
  if (!secret) {
    // No secret configured at all — fail closed in prod, log loudly.
    console.warn(
      "[sendcloud-webhook] no SENDCLOUD_SECRET_KEY (or override) set — refusing requests",
    );
    return false;
  }
  if (!signature) return false;

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Sigs may differ in length if the header was tampered with; normalise.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type SendcloudWebhookEvent = {
  action?: string;
  parcel?: {
    id?: number;
    tracking_number?: string | null;
    tracking_url?: string | null;
    status?: { id?: number; message?: string };
    external_reference?: string | null;
    order_number?: string | null;
  };
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read the raw body BEFORE parsing JSON — HMAC is computed over the
  // exact bytes Sendcloud sent, including whitespace.
  const rawBody = await req.text();
  const signature = req.headers.get("sendcloud-signature");

  if (!verifySignature(rawBody, signature)) {
    console.warn("[sendcloud-webhook] rejected — bad signature");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let event: SendcloudWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    // Malformed body but signature was right — odd, but ack to stop retries.
    return new NextResponse("OK", { status: 200 });
  }

  const action = event.action ?? "";
  const parcel = event.parcel;
  if (!parcel || !parcel.id) {
    console.warn("[sendcloud-webhook] missing parcel.id; action:", action);
    return new NextResponse("OK", { status: 200 });
  }

  // We only act on status-change events. Everything else gets logged
  // and 200'd so Sendcloud's webhook-test pings succeed.
  if (action !== "parcel_status_changed") {
    return new NextResponse("OK", { status: 200 });
  }

  // Resolve the order — prefer external_reference (our internal id),
  // fall back to the Sendcloud parcel id.
  const order = await prisma.order.findFirst({
    where: parcel.external_reference
      ? { id: parcel.external_reference }
      : { sendcloudParcelId: String(parcel.id) },
    select: {
      id: true,
      publicNumber: true,
      status: true,
      sendcloudParcelId: true,
    },
  });
  if (!order) {
    console.warn(
      `[sendcloud-webhook] no order for parcel ${parcel.id} / ref ${parcel.external_reference}`,
    );
    return new NextResponse("OK", { status: 200 });
  }

  const bucket = bucketForStatusId(parcel.status?.id);
  const next = nextOrderStatusForBucket(bucket, order.status);

  // Always backfill tracking info — sometimes the parcel-creation call
  // returns nulls and the tracking number only lands on the first
  // status webhook. Updating idempotently is cheap.
  const updateData: {
    sendcloudParcelId?: string;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    status?: OrderStatus;
  } = {};
  if (!order.sendcloudParcelId) {
    updateData.sendcloudParcelId = String(parcel.id);
  }
  if (parcel.tracking_number) {
    updateData.trackingNumber = parcel.tracking_number;
  }
  if (parcel.tracking_url) {
    updateData.trackingUrl = parcel.tracking_url;
  }

  let willFireShipped = false;
  if (next && next !== order.status) {
    updateData.status = next;
    if (next === OrderStatus.SHIPPED) willFireShipped = true;
    if (next === OrderStatus.DELIVERED) {
      // Mark deliveredAt now so the review-request cron picks it up
      // 14 days later (see #84).
      // (deliveredAt added with the rest below)
    }
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        ...updateData,
        ...(next === OrderStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
      },
    });
  }

  // Audit log — every status change we recognise + the failed bucket
  // (so an admin can find lost / cancelled parcels with a single grep).
  await prisma.orderEvent
    .create({
      data: {
        orderId: order.id,
        kind: `sendcloud.parcel.${bucket}`,
        metadata: {
          parcelId: String(parcel.id),
          statusId: parcel.status?.id ?? null,
          statusMessage: parcel.status?.message ?? null,
        },
      },
    })
    .catch(() => undefined);

  // Fire the customer "your order has shipped" email when we just
  // transitioned to SHIPPED. The helper is allSettled-safe.
  if (willFireShipped) {
    await sendOrderShippedEmail(order.id).catch((err) => {
      console.error(
        `[sendcloud-webhook] shipped email failed for ${order.publicNumber}`,
        err,
      );
    });
  }

  console.log(
    `[sendcloud-webhook] ${order.publicNumber}: ${parcel.status?.message ?? "?"} (bucket=${bucket}${
      next ? `, status=${next}` : ""
    })`,
  );

  return new NextResponse("OK", { status: 200 });
}

// Sendcloud's "Test webhook" button sends a GET first sometimes.
export async function GET(): Promise<NextResponse> {
  return new NextResponse("OK", { status: 200 });
}
