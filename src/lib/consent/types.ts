// ─────────────────────────────────────────────────────────────────────────
// Consent types — shared between the server and client.
//
// The three GDPR consent categories we expose. `necessary` is always
// granted (the site cannot function without it) — we still store it to
// keep the audit log symmetric.
// ─────────────────────────────────────────────────────────────────────────

export type ConsentPurpose = "necessary" | "analytics" | "marketing";

export const CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  "necessary",
  "analytics",
  "marketing",
] as const;

/** What we store in the `yur_consent` cookie. Version-tagged so we can force
 *  a re-prompt later if we change the categories. */
export type ConsentPrefs = {
  v: 1;
  necessary: true; // always granted
  analytics: boolean;
  marketing: boolean;
  ts: string; // ISO timestamp
};

/** Current cookie schema version. Bump this when meaningfully changing
 *  categories — old cookies will be treated as "missing" and the banner
 *  will re-appear. */
export const CONSENT_VERSION = 1 as const;

/** Name of the (non-HttpOnly) cookie that stores the user's choice. We
 *  deliberately make this readable from JS so the banner can hide itself
 *  without a server round-trip on subsequent page views. */
export const CONSENT_COOKIE = "yur_consent";

/** 12 months — matches our cookie policy disclosure. */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Handy "all refused except necessary" preset — used by both the
 *  "Reject non-essential" button and as the initial state of the banner. */
export const CONSENT_MINIMAL: Omit<ConsentPrefs, "ts"> = {
  v: CONSENT_VERSION,
  necessary: true,
  analytics: false,
  marketing: false,
};

/** "Accept all" preset. */
export const CONSENT_ALL: Omit<ConsentPrefs, "ts"> = {
  v: CONSENT_VERSION,
  necessary: true,
  analytics: true,
  marketing: true,
};
