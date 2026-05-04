// ─────────────────────────────────────────────────────────────────────────
// dataLayer typing + push helper.
//
// GTM listens on `window.dataLayer` for events that drive its tags. We
// keep the shape loose intentionally — `Record<string, unknown>` — because
// every tag has its own contract for what fields it expects, and we'd
// rather catch a mismatch in GTM Preview Mode than fight TypeScript.
//
// The narrow types we DO declare are for the Consent Mode v2 + GA4
// recommended events we actually emit from this codebase. Everything
// else is forwarded through `pushDataLayer()` as untyped record entries.
//
// One subtle thing: `gtag()` is just `dataLayer.push(arguments)` under
// the hood. We expose both styles so the consent-defaults inline script
// can use the familiar `gtag('consent', ...)` form while application
// code uses `pushDataLayer({ event: 'purchase', ... })`.
// ─────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    /** GTM dataLayer accepts:
     *   · plain objects (the canonical event-push form),
     *   · IArguments (what gtag('config', ...) pushes under the hood),
     *   · plain arrays (the same command tuple, just spelled out from a
     *     React component where `arguments` isn't available).
     *  The third form is what the consent-update listener uses. GTM's
     *  command processor reads entry[0]/[1]/[2] regardless of whether
     *  the entry is an Array or an arguments object. */
    dataLayer?: Array<Record<string, unknown> | IArguments | unknown[]>;
  }
}

/** Push an event onto the GTM dataLayer. Safe on SSR — bails early if
 *  `window` is undefined. The dataLayer is initialised lazily so this
 *  works even before GTM has loaded; GTM picks up queued entries when
 *  it boots. */
export function pushDataLayer(entry: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(entry);
}

// ─── Consent Mode v2 ──────────────────────────────────────────────────
// Maps our cookie banner's two booleans (analytics, marketing) onto the
// six Consent Mode signals Google expects. `marketing=true` flips all
// three ad_* signals; `analytics=true` flips analytics_storage. The
// last two — functionality_storage and security_storage — are tied to
// the always-granted "necessary" purpose.

export type ConsentSignal = "granted" | "denied";

export type ConsentState = {
  ad_storage: ConsentSignal;
  ad_user_data: ConsentSignal;
  ad_personalization: ConsentSignal;
  analytics_storage: ConsentSignal;
  functionality_storage: ConsentSignal;
  security_storage: ConsentSignal;
};

/** Translate our cookie's (analytics, marketing) booleans into the full
 *  Consent Mode v2 signal payload. Used by both the inline boot script
 *  and the runtime "consent updated" listener — keeping the mapping in
 *  one place avoids drift between initial state and updates. */
export function consentStateFromPrefs(
  prefs: { analytics: boolean; marketing: boolean } | null,
): ConsentState {
  const analytics = prefs?.analytics === true;
  const marketing = prefs?.marketing === true;
  return {
    ad_storage: marketing ? "granted" : "denied",
    ad_user_data: marketing ? "granted" : "denied",
    ad_personalization: marketing ? "granted" : "denied",
    analytics_storage: analytics ? "granted" : "denied",
    // Necessary cookies — always granted, not subject to user choice.
    functionality_storage: "granted",
    security_storage: "granted",
  };
}
