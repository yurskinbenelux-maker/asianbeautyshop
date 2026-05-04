// ─────────────────────────────────────────────────────────────────────────
// PurchaseTracker — fires the `purchase` dataLayer event once on the
// /[locale]/checkout/success page.
//
// Why a separate component (vs. inline `<script>` or useEffect on the
// page itself):
//   · The success page is a Server Component (it fetches the order
//     server-side). Pushing to dataLayer requires `window`, so we
//     isolate the client work in this component and pass the order
//     payload down as props.
//   · Using a client component also lets us guard against double-fire
//     on Strict Mode + Fast Refresh in dev. We track the last
//     transaction_id we pushed in a ref and skip if it matches.
//
// Idempotency in production is already handled by GA4 + Ads deduping
// on transaction_id. The ref-based guard is purely a dev-mode courtesy
// to avoid noisy duplicates in GTM Preview Mode.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef } from "react";
import { trackPurchase, type PurchaseEvent } from "@/lib/analytics/track-purchase";

export function PurchaseTracker(props: PurchaseEvent) {
  const lastFiredFor = useRef<string | null>(null);

  useEffect(() => {
    if (lastFiredFor.current === props.transaction_id) return;
    lastFiredFor.current = props.transaction_id;
    trackPurchase(props);
    // We intentionally re-run only when transaction_id changes. The other
    // fields are derived from the same order, so if they change without
    // transaction_id changing we're in an inconsistent state and should
    // not double-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.transaction_id]);

  return null;
}
