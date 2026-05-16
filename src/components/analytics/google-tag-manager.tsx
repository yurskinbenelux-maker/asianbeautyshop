// ─────────────────────────────────────────────────────────────────────────
// Google Tag Manager loader with Consent Mode v2.
//
// What this component does, in order, on first paint:
//
//   1. Initialises the dataLayer.
//   2. Pushes Consent Mode v2 *defaults* — every signal "denied" except
//      the two tied to the always-granted "necessary" purpose. This must
//      happen BEFORE GTM loads any tags, otherwise GA4 / Google Ads
//      would briefly tag the visitor before consent rules apply.
//   3. If the user has already chosen (cookie present), pushes an
//      immediate `consent update` reflecting their choice. No flicker
//      between "denied default" and "user-chosen" because both pushes
//      happen in the same synchronous inline script tag, before GTM's
//      external script src has even hit the network.
//   4. Loads the GTM container script.
//
// After mount, the component listens for `yur:consent-updated` events
// fired by the cookie banner when the user changes their mind, and
// pushes a fresh `consent update` so GA4 / Google Ads stop or start
// tagging accordingly. Google calls this "modeled conversions" — even
// users who decline still feed aggregate signals via Consent Mode, so
// Smart Bidding doesn't go blind.
//
// Why we ALWAYS load GTM (vs. gating the script tag itself):
//   Consent Mode v2 is *designed* for this pattern — load the container,
//   start in privacy-safe mode, upgrade when the user accepts. Gating
//   the script entirely means we lose the modeled-conversions benefit
//   for users who never accept (an admin's bidding suffers).
//
// noscript fallback:
//   Skipped on purpose. The fallback iframe runs without consent, which
//   is illegal in the EEA. Users with JS disabled get no tracking.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import Script from "next/script";
import { useEffect } from "react";
import {
  consentStateFromPrefs,
  type ConsentState,
} from "@/lib/analytics/dataLayer";
import type { ConsentPrefs } from "@/lib/consent/types";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

// Cloudflare Google Tag Gateway support: when this env var is set we load
// gtm.js through a first-party path on our own domain (e.g. "/metrics")
// instead of googletagmanager.com. Cloudflare's gateway then proxies the
// request to Google AND rewrites the gtm.js response so subsequent GA4 /
// Ads endpoints (google-analytics.com/g/collect, etc.) also resolve to
// the same first-party path. Net effect: defeats most adblockers + Safari
// ITP, restoring 15-30% of the analytics signal we'd otherwise lose.
//
// Falls back to googletagmanager.com when unset (local dev, or any
// deployment without the gateway configured) so the loader still works.
const GTM_GATEWAY_URL =
  process.env.NEXT_PUBLIC_GTM_GATEWAY_URL || "https://www.googletagmanager.com";

type Props = {
  /** Server-side read of the consent cookie. Passed in so we can write
   *  the initial state directly into the inline boot script — no flash
   *  between "all denied" defaults and the user's saved choice. Null
   *  when the cookie is missing (first visit / cookie expired). */
  initialConsent: ConsentPrefs | null;
};

export function GoogleTagManager({ initialConsent }: Props) {
  // Listen for consent updates dispatched by the cookie banner after the
  // user accepts / saves preferences. We map the two booleans to the
  // full Consent Mode v2 payload via the shared helper so this stays in
  // sync with the initial state above.
  useEffect(() => {
    if (!GTM_ID) return;

    function onConsentUpdated(event: Event) {
      const detail = (event as CustomEvent<{
        analytics: boolean;
        marketing: boolean;
      }>).detail;
      if (!detail) return;
      const next: ConsentState = consentStateFromPrefs(detail);
      // gtag('consent', 'update', state) is `dataLayer.push(arguments)`
      // under the hood — the entry that lands in dataLayer is array-like
      // with index 0 = "consent", 1 = "update", 2 = state. We can't use
      // `arguments` from a React handler, so we push the equivalent
      // plain array. GTM's consent processor handles both shapes.
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(["consent", "update", next]);
    }

    window.addEventListener("yur:consent-updated", onConsentUpdated);
    return () =>
      window.removeEventListener("yur:consent-updated", onConsentUpdated);
  }, []);

  // Without an ID configured we don't load anything — convenient for
  // local dev where an admin's GTM container shouldn't see traffic.
  if (!GTM_ID) return null;

  const initialState = consentStateFromPrefs(
    initialConsent
      ? { analytics: initialConsent.analytics, marketing: initialConsent.marketing }
      : null,
  );

  return (
    <>
      {/* ── 1. Consent defaults + initial state ─────────────────────
          strategy="lazyOnload" — fires after the page has fully
          loaded (window load event + browser idle). Used to be
          "afterInteractive", which put the ~50-150KB GTM container
          on the LCP critical path and contributed to a 5.3s mobile
          LCP. Deferring buys back ~1-1.5s of LCP on slow phones
          without changing what tags actually fire — the consent
          default still runs BEFORE the loader thanks to JSX order. */}
      <Script id="yur-gtm-consent-init" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', ${JSON.stringify({
            ...consentStateFromPrefs(null), // all denied
            wait_for_update: 500,
          })});
          ${
            initialConsent
              ? `gtag('consent', 'update', ${JSON.stringify(initialState)});`
              : ""
          }
          gtag('js', new Date());
        `}
      </Script>

      {/* ── 2. GTM loader (Google's official snippet, just inlined) ── */}
      <Script id="yur-gtm-loader" strategy="lazyOnload">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='${GTM_GATEWAY_URL}/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>
    </>
  );
}
