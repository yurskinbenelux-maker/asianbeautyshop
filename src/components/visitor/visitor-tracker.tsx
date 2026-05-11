// ─────────────────────────────────────────────────────────────────────────
// VisitorTracker — invisible client component that fires a presence
// heartbeat to /api/track once on mount and every 60 seconds thereafter
// while the tab stays visible.
//
// Used by the admin dashboard "visitors online" widget to estimate
// how many concurrent users are on the site (so an admin sees when she's
// approaching the Hostinger Max Processes ceiling).
//
// Behaviour notes:
//   · Skips the ping while the tab is in the background — no point
//     paying for a DB write when the user isn't really browsing.
//   · One outbound fetch ≈ 5-10ms server work + a single tiny upsert.
//     Negligible compared to a normal page load.
//   · Doesn't render anything. Just sits in the layout firing pulses.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const HEARTBEAT_INTERVAL_MS = 60_000;

export function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Tiny helper — single source of truth for the request shape so
    // both the initial ping and the interval ping stay in sync.
    function ping() {
      // Skip if the tab is hidden (browser pause, switched tab) — the
      // user isn't really "online" then. The next visibility-change
      // event re-fires the ping immediately.
      if (typeof document !== "undefined" && document.hidden) return;

      // Fire-and-forget. We don't care about the response; failures are
      // logged server-side. `keepalive: true` lets the request survive
      // a tab close, so we get one final ping when the user leaves.
      void fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathname }),
        keepalive: true,
      }).catch(() => {
        /* swallow — tracking failures must never affect UX */
      });
    }

    // Fire one immediately so a visitor counts as online right away,
    // not 60s after they land.
    ping();

    // Heartbeat — every 60 seconds while the page is open.
    const id = window.setInterval(ping, HEARTBEAT_INTERVAL_MS);

    // When the tab comes back to foreground (e.g. user returns from
    // another tab) fire an immediate ping so they reappear in the
    // online count without waiting for the next interval tick.
    function onVisibilityChange() {
      if (!document.hidden) ping();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname]);

  return null;
}
