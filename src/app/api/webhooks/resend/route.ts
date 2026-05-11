// ─────────────────────────────────────────────────────────────────────────
// Resend webhook — bounces, complaints, deliveries.
//
// Set this up in Resend dashboard → Webhooks → Add Endpoint:
//   URL:    https://asianbeautyshop.eu/api/webhooks/resend
//   Events: email.bounced, email.complained, email.delivered (optional)
//   Signing secret: paste into RESEND_WEBHOOK_SECRET in the env
//
// Why we care:
//   • bounce  → the address is bad. Mark the NewsletterSubscriber row
//     as unsubscribed so we stop mailing them. Keeps sender reputation
//     healthy on Gmail/Outlook.
//   • complaint (spam report) → same: remove from list. Ignoring these
//     is how senders get blocklisted.
//   • delivered → just ack. We don't store delivery receipts today.
//
// Resend uses Svix under the hood for signatures. Headers:
//   svix-id, svix-timestamp, svix-signature
// We verify the signature inline (HMAC-SHA256 over
// `${id}.${timestamp}.${body}` with the base64-decoded secret) to
// avoid pulling the `svix` SDK as a dependency. If RESEND_WEBHOOK_SECRET
// is unset we accept payloads unverified (dev only — log a warning).
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Never cache a webhook endpoint — every request must hit the handler.
export const dynamic = "force-dynamic";

// ────────── payload shapes ──────────────────────────────────────────────
//
// Resend sends `{ type, created_at, data }` envelopes. For email.* events
// data contains: email_id, from, to (array), subject, created_at,
// and event-specific fields. We only need `to` (the recipient) and the
// event type, so we keep the typing loose and defensive.

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    // …other fields we don't read
  };
};

// ────────── handler ─────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.text(); // raw body — Svix verification needs bytes

  // 1. Verify signature (unless we're in "no secret configured" dev mode).
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  let payload: ResendEvent;

  if (secret) {
    const svixId = req.headers.get("svix-id") ?? "";
    const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
    const svixSignature = req.headers.get("svix-signature") ?? "";

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn("[resend-webhook] missing svix headers");
      return new NextResponse("missing signature headers", { status: 401 });
    }

    if (!verifySvixSignature(secret, svixId, svixTimestamp, body, svixSignature)) {
      console.warn("[resend-webhook] signature verification failed");
      return new NextResponse("invalid signature", { status: 401 });
    }

    try {
      payload = JSON.parse(body) as ResendEvent;
    } catch {
      return new NextResponse("invalid json", { status: 400 });
    }
  } else {
    console.warn(
      "[resend-webhook] RESEND_WEBHOOK_SECRET not set — accepting payload unverified",
    );
    try {
      payload = JSON.parse(body) as ResendEvent;
    } catch {
      return new NextResponse("invalid json", { status: 400 });
    }
  }

  // 2. Route on event type.
  const type = payload.type ?? "";
  const recipients = toRecipients(payload.data?.to);
  if (recipients.length === 0) {
    // Nothing we can act on without a recipient address.
    return NextResponse.json({ ok: true, handled: "noop" });
  }

  try {
    if (type === "email.bounced") {
      const severity = payload.data?.bounce?.type ?? "unknown";
      // Hard bounces (permanent failures) get the subscriber removed.
      // Soft bounces (temporary) are logged but don't remove — the
      // address may come back.
      if (isHardBounce(severity)) {
        await markRecipientsUnsubscribed(recipients, "bounce");
      } else {
        console.info(
          `[resend-webhook] soft bounce for ${recipients.join(", ")} — keeping on list`,
        );
      }
    } else if (type === "email.complained") {
      // Spam complaint = always remove. No second chances.
      await markRecipientsUnsubscribed(recipients, "complaint");
    }
    // email.delivered / email.sent / email.opened / email.clicked → ignore.
  } catch (err) {
    console.error("[resend-webhook] handler error", err);
    // Still 200 OK so Resend doesn't retry on our bug. We'd rather skip
    // one event than have them pile up in the dead-letter queue.
  }

  return NextResponse.json({ ok: true });
}

// ────────── helpers ─────────────────────────────────────────────────────

/**
 * Verify a Svix-style signature (what Resend sends).
 *
 * Svix signing format:
 *   - `svix-id` header: message id
 *   - `svix-timestamp` header: unix seconds
 *   - `svix-signature` header: space-separated list of `v1,<base64>` entries
 *     (one webhook can have multiple signatures during a secret rotation —
 *     we accept if ANY match)
 *   - The signed content is the literal string `${id}.${timestamp}.${body}`
 *   - The secret ships as `whsec_<base64>`. Base64-decode the part after
 *     the prefix to get the raw signing key bytes.
 *
 * We also reject timestamps older than 5 minutes (Svix's recommended
 * replay-protection window) so a leaked signed request can't be re-sent
 * at leisure.
 */
function verifySvixSignature(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): boolean {
  // Replay protection: ±5 minute window.
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 5 * 60) return false;

  // Parse whsec_<base64> → raw bytes.
  const secretB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secretB64, "base64");
  } catch {
    return false;
  }
  if (secretBytes.length === 0) return false;

  // Compute expected signature (base64 of HMAC-SHA256 over id.timestamp.body).
  const signedContent = `${id}.${timestamp}.${body}`;
  const expected = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest();

  // Signature header: "v1,<sig> v1,<sig2> ..." — accept any match.
  for (const entry of signatureHeader.split(" ")) {
    const [version, sigB64] = entry.split(",");
    if (version !== "v1" || !sigB64) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(sigB64, "base64");
    } catch {
      continue;
    }
    if (provided.length !== expected.length) continue;
    if (timingSafeEqual(provided, expected)) return true;
  }
  return false;
}

function toRecipients(to: string[] | string | undefined): string[] {
  if (!to) return [];
  const list = Array.isArray(to) ? to : [to];
  return list
    .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
    .filter(Boolean);
}

/**
 * Resend's bounce types (derived from AWS SES): Permanent, Transient,
 * Undetermined. "Permanent" is hard — the mailbox is dead. Treat
 * Undetermined as soft (don't remove) to stay conservative.
 */
function isHardBounce(severity: string): boolean {
  const s = severity.toLowerCase();
  return s === "permanent" || s === "hard";
}

/**
 * Flip NewsletterSubscriber rows to unsubscribed. Idempotent — repeat
 * events on the same address are fine, we just keep the earliest
 * unsubscribedAt and clear the token.
 *
 * `reason` is written to the subscriber's source field prefixed with
 * "removed:" so an admin can see why they left the list. This keeps the
 * audit trail inside the existing schema without needing a migration.
 */
async function markRecipientsUnsubscribed(
  emails: string[],
  reason: "bounce" | "complaint",
): Promise<void> {
  const now = new Date();
  for (const email of emails) {
    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email },
      select: { id: true, unsubscribedAt: true, source: true },
    });
    if (!existing) continue;
    if (existing.unsubscribedAt) continue; // already removed, nothing to do

    await prisma.newsletterSubscriber.update({
      where: { email },
      data: {
        unsubscribedAt: now,
        tokenHash: null,
        source:
          existing.source && existing.source.startsWith("removed:")
            ? existing.source
            : `removed:${reason}${existing.source ? `:${existing.source}` : ""}`,
      },
    });
    console.info(
      `[resend-webhook] removed ${email} from newsletter (${reason})`,
    );
  }
}
