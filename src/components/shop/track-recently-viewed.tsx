// ─────────────────────────────────────────────────────────────────────────
// TrackRecentlyViewed — tiny client-only effect that records the current
// PDP into the recently-viewed list. Renders nothing.
//
// Lives separate from RecentlyViewedRail because the PDP needs to record
// the view EVEN when the rail is hidden (e.g. the visitor is on their
// first PDP — rail won't render until they have ≥ 2 items, but we want
// to keep tracking from view #1 onward).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect } from "react";
import { recordRecentlyViewed } from "@/lib/recently-viewed";

type Props = {
  slug: string;
  name: string;
  imageUrl: string | null;
  priceEur: number;
  comparePriceEur: number | null;
};

export function TrackRecentlyViewed(props: Props) {
  useEffect(() => {
    recordRecentlyViewed(props);
    // We deliberately depend on slug only — re-recording on every prop
    // change (e.g. price drift between SSR and client) would push the
    // same product to the top of the list multiple times in quick
    // succession. The slug is the identity; price/name updates land
    // next time the user visits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.slug]);

  return null;
}
