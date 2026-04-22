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
