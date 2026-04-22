// ─────────────────────────────────────────────────────────────────────────
// Consent server actions — called by the cookie banner client component.
//
// We expose a single `recordConsent` action that writes the cookie and
// fires off the audit log. We intentionally keep this tiny: the client is
// the source of truth for the banner's dismissed state (via the cookie it
// just wrote), so we don't need to return anything complex.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { z } from "zod";
import {
  readConsentCookie,
  recordConsentAudit,
  writeConsentCookie,
} from "./consent";
import { CONSENT_VERSION, type ConsentPrefs } from "./types";

// Strict shape — we only accept the two toggleable purposes from the
// client. `necessary` is implicit + always true; `v` + `ts` are set
// server-side. This narrows the attack surface: a bad actor can't mint
// a cookie that claims to be a newer schema version, nor set `necessary`
// to false.
const InputSchema = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
});

export type RecordConsentResult = {
  ok: boolean;
  message?: string;
};

export async function recordConsentAction(input: {
  analytics: boolean;
  marketing: boolean;
}): Promise<RecordConsentResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid consent payload." };
  }

  const prefs: ConsentPrefs = {
    v: CONSENT_VERSION,
    necessary: true,
    analytics: parsed.data.analytics,
    marketing: parsed.data.marketing,
    ts: new Date().toISOString(),
  };

  await writeConsentCookie(prefs);
  // Fire-and-forget audit log. We await it (so errors surface in logs),
  // but recordConsentAudit swallows its own errors so the banner never
  // reports a failure just because the audit row didn't land.
  await recordConsentAudit({ prefs });

  return { ok: true };
}

/** Server-side check used by the layout so we don't flash the banner on
 *  re-visits. The client will also run its own check against
 *  `document.cookie`, but doing it here too eliminates the flash. */
export async function peekConsentAction(): Promise<{
  hasConsent: boolean;
  prefs: ConsentPrefs | null;
}> {
  const prefs = await readConsentCookie();
  return { hasConsent: prefs !== null, prefs };
}
