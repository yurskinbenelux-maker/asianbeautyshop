// ─────────────────────────────────────────────────────────────────────────
// ReferralCapture — silent client component that catches `?ref=CODE` on
// any page and persists it for the eventual sign-up.
//
// Why localStorage and not a cookie:
//   The captured value is a functional/attribution token tied to a user
//   action (clicking a friend's link). Under GDPR Consent Mode v2 it
//   would qualify as `functionality_storage` (granted by default in our
//   setup), but using localStorage avoids the question entirely — it's
//   per-origin, never sent to the server unsolicited, and doesn't appear
//   in our cookie banner. Cookies-disabled customers still get attributed
//   as long as their browser allows the localStorage write (essentially
//   all of them; only paranoid hardening flips both off).
//
// Belt-and-braces: the sign-up form ALSO reads `?ref=` from the URL
// directly on mount, so a customer who clicks /?ref=ALEX-AB12 and
// immediately heads to /sign-up still gets the code prefilled even if
// localStorage is sandboxed.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect } from "react";

const STORAGE_KEY = "yur:ref";
const TTL_DAYS = 90;
const CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)?$/i;

type StoredEntry = {
  code: string;
  /** Capture timestamp — used to expire stale referrals. */
  ts: number;
};

export function ReferralCapture() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (!ref) return;

    // Sanity-check before persisting — codes are short, alphanumeric, may
    // contain a single dash. Anything else is junk / a tracker mimic.
    const trimmed = ref.trim().toUpperCase();
    if (trimmed.length === 0 || trimmed.length > 32) return;
    if (!CODE_PATTERN.test(trimmed)) return;

    try {
      const entry: StoredEntry = { code: trimmed, ts: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch {
      /* private mode / quota issues — silent. The form's URL fallback
       *  still works in the worst case. */
    }

    // Clean the URL — keeps the bar tidy and stops sharing a referral
    // attribution accidentally if the customer copies the URL after
    // landing.
    url.searchParams.delete("ref");
    const nextHref = url.pathname + (url.search ? url.search : "") + url.hash;
    window.history.replaceState({}, "", nextHref);
  }, []);

  return null;
}

/** Helper for the sign-up form. Reads + validates a stored referral code
 *  written by the component above. Returns null when missing, malformed,
 *  or expired. */
export function readStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<StoredEntry>;
    if (typeof entry.code !== "string") return null;
    if (typeof entry.ts !== "number") return null;
    const ageDays = (Date.now() - entry.ts) / (1000 * 60 * 60 * 24);
    if (!Number.isFinite(ageDays) || ageDays > TTL_DAYS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return entry.code;
  } catch {
    return null;
  }
}

/** Public — called by the sign-up form after a successful submission to
 *  clean up the stored attribution. */
export function clearStoredReferralCode(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}
