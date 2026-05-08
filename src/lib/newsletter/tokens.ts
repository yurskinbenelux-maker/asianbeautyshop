// ─────────────────────────────────────────────────────────────────────────
// Newsletter opt-in / unsubscribe token helpers.
//
// Flow:
//   1. Subscribe action generates a raw 32-byte token, hashes it (SHA-256),
//      and stores only the HASH in NewsletterSubscriber.tokenHash.
//   2. The raw token goes out in the confirmation email link.
//   3. When the user clicks, /api/newsletter/confirm hashes the query param
//      and looks up the row by hash — so a DB leak doesn't give an attacker
//      valid confirm links.
//
// Unsubscribe uses the same trick: we rotate the tokenHash when the user
// confirms, and embed the new raw token in every newsletter send for
// one-click unsubscribe.
// ─────────────────────────────────────────────────────────────────────────

import { randomBytes, createHash } from "crypto";

/** Generate a URL-safe random token (64 hex chars = 32 bytes entropy). */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hash, lowercase hex — what we store in the DB. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Constant-time-ish check that two tokens match. We're comparing SHA-256
 * digests so both inputs are fixed length — a short-circuit compare is
 * still fine, but doing it character-by-character keeps the intent clear.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Absolute unsubscribe URL for a given raw token. Used in both the email
 * footer link AND the RFC2369 List-Unsubscribe header.
 */
export function unsubscribeUrl(rawToken: string): string {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  return `${site}/api/newsletter/unsubscribe?token=${encodeURIComponent(rawToken)}`;
}

/**
 * RFC2369 + RFC8058 List-Unsubscribe headers for any outbound newsletter
 * email. Pass the raw (unhashed) per-recipient token so the gateway link
 * carries that user's specific token; it gets POSTed back here when the
 * user clicks "Unsubscribe" in Gmail / Outlook.
 *
 *   List-Unsubscribe       — RFC2369 (URL we open on click)
 *   List-Unsubscribe-Post  — RFC8058 (declares one-click compliance, so
 *                            mailbox providers POST without prompting)
 *
 * We deliberately omit the `mailto:` fallback — we don't run an
 * unsubscribe@ inbox, and the HTTPS URL is what Gmail/Outlook actually use.
 *
 * Why this matters for deliverability: Gmail since Feb 2024 *requires*
 * one-click unsubscribe on bulk senders. Without it, our newsletter goes
 * straight to spam (or worse, gets the whole sending domain throttled).
 */
export function newsletterListUnsubscribeHeaders(
  rawToken: string,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(rawToken)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
