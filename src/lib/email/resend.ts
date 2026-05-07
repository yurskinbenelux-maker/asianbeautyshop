// ─────────────────────────────────────────────────────────────────────────
// Resend client — lazy, null-safe.
//
// Why null-safe: during local dev Sofia (and Max) might not have a
// RESEND_API_KEY set. Instead of crashing the newsletter server action,
// we return null and let the caller no-op the send (logging a warning).
// Production deploys will always have the key set in hPanel env.
//
// Why lazy: the `resend` package pulls in node:crypto and other runtime
// deps. We don't want to initialise it at import time for server actions
// that never touch email.
// ─────────────────────────────────────────────────────────────────────────

import { Resend } from "resend";

let cached: Resend | null | undefined;

/**
 * Returns a Resend client, or null if RESEND_API_KEY is not configured.
 * Callers should guard with `if (!client) return …` and log a warning.
 */
export function getResend(): Resend | null {
  if (cached !== undefined) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key || key.startsWith("re_xxxxx")) {
    // Example / placeholder key — treat as not configured.
    cached = null;
    return null;
  }
  cached = new Resend(key);
  return cached;
}

/**
 * "From" address for the newsletter (monthly letter + double-opt-in).
 * Uses newsletter@asianbeautyshop.eu so customers can visually separate
 * marketing from transactional mail in their inbox filters.
 */
export function fromNewsletter(): string {
  return (
    process.env.RESEND_FROM_NEWSLETTER ??
    "Asian Beauty Shop Letter <newsletter@asianbeautyshop.eu>"
  );
}

/**
 * "From" address for transactional email (order receipts, password reset,
 * account verification). Uses donotreply@ so customers understand replies
 * to this mailbox aren't watched — combined with Reply-To: hello@ so
 * hitting the reply button still routes to a human.
 */
export function fromTransactional(): string {
  return (
    process.env.RESEND_FROM_TRANSACTIONAL ??
    "Asian Beauty Shop <donotreply@asianbeautyshop.eu>"
  );
}

/**
 * Reply-To on every outbound mail. Always points at the human inbox so
 * customers can write back even when we sent from donotreply@.
 */
export function replyToAddress(): string | undefined {
  return process.env.RESEND_REPLY_TO || "hello@asianbeautyshop.eu";
}

/**
 * The mailbox that receives admin-only notifications (new orders,
 * low-stock alerts). Kept separate from the customer-facing addresses.
 */
export function adminNotificationEmail(): string | undefined {
  return process.env.ADMIN_NOTIFICATION_EMAIL || undefined;
}
