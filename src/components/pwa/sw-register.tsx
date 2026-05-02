// ─────────────────────────────────────────────────────────────────────────
// SwRegister — registers /sw.js on first paint. Mounted once at the
// root layout. Renders nothing.
//
// We intentionally don't ship a register-on-load fallback for older
// browsers that don't support service workers — they just don't get
// the offline behaviour, which matches the graceful-degradation
// principle for the rest of the site (PWA is an enhancement).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Don't register on dev — the SW caches stuff that bites during
    // hot-reload. Only run on the deployed site.
    if (window.location.hostname === "localhost") return;

    // Wait until window load event so we don't compete with the
    // first paint for resources.
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[sw] register failed", err);
      });
    };
    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
