// ─────────────────────────────────────────────────────────────────────────
// trackPurchase — pushes a GA4-shaped `purchase` event onto the dataLayer.
//
// One event, two destinations:
//   · GA4 picks it up via its standard ecommerce schema (transaction_id,
//     value, currency, items[]).
//   · Google Ads picks it up via the Conversion tag we'll wire in GTM,
//     reading the same transaction_id (used for de-dup) and value.
//
// Idempotency:
//   Both GA4 and Google Ads dedupe on `transaction_id`. We always pass
//   the order's `publicNumber` (e.g. YUR-12345) — so a customer who
//   refreshes /checkout/success or shares the URL with their accountant
//   doesn't double-count.
//
// Currency:
//   Hardcoded EUR everywhere in the shop's pricing engine, but exposed
//   as a parameter for future-proofing if Sofia ever sells in CHF, GBP,
//   etc. via a separate Mollie account.
//
// `affiliation` is optional — Google uses it to group orders by store
// in multi-store reports. We send "YU.R Skin Solution" so it's not
// blank, but it doesn't change attribution.
// ─────────────────────────────────────────────────────────────────────────

import { pushDataLayer } from "./dataLayer";

export type PurchaseItem = {
  /** Stable product SKU or slug — must match between cart events and
   *  the purchase event so GA4 builds a coherent funnel. */
  item_id: string;
  /** Localised product display name. */
  item_name: string;
  /** Price per unit in EUR (after any line-level discounts). */
  price: number;
  /** Number of units bought. */
  quantity: number;
  /** Optional category — surfaces in GA4 product reports. */
  item_category?: string;
  /** Optional brand — currently always "YU.R" but future-proof for
   *  multi-brand catalogues. */
  item_brand?: string;
  /** Optional variant — e.g. "30ml" / "50ml". Helps Sofia see which SKU
   *  size sells better. */
  item_variant?: string;
};

export type PurchaseEvent = {
  transaction_id: string;
  value: number;
  /** Tax portion of `value`. GA4 uses this for net-revenue reporting. */
  tax?: number;
  /** Shipping portion of `value`. */
  shipping?: number;
  currency: string;
  /** Coupon code if one was applied — surfaces in GA4 promotion reports. */
  coupon?: string;
  items: PurchaseItem[];
};

/** Push a `purchase` event onto the dataLayer. Safe to call from
 *  components that may render server-side — `pushDataLayer` no-ops on
 *  the server. */
export function trackPurchase(event: PurchaseEvent): void {
  pushDataLayer({
    // GA4 expects this exact event name. Google Ads' GTM template lets
    // us trigger off the same event, so one push covers both.
    event: "purchase",
    ecommerce: {
      transaction_id: event.transaction_id,
      value: event.value,
      tax: event.tax ?? 0,
      shipping: event.shipping ?? 0,
      currency: event.currency,
      coupon: event.coupon,
      affiliation: "YU.R Skin Solution",
      items: event.items,
    },
  });
}
