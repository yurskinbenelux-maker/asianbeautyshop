// ─────────────────────────────────────────────────────────────────────────
// Sendcloud parcel status → our OrderStatus mapping.
//
// Sendcloud emits parcel_status_changed webhooks with a `parcel_status`
// object that includes both an `id` (numeric, stable) and a `message`
// (English label, may change). We map by id where possible because
// Sendcloud has refactored the wording before but never the ids.
//
// Reference status table (parcel_statuses endpoint, condensed):
//   1   — Announced / awaiting carrier
//   3   — En route to sorting center
//   4   — Delivered to sorting center
//   5   — Sorted
//   6   — In transit / on route to delivery
//   11  — Delivered at customer
//   12  — Delivered to service point
//   13  — Awaiting customer pickup
//   14  — Customer pickup expired
//   15  — Cancellation requested
//   62  — Cancelled
//   91  — Returned to sender
//   92  — Address changed
//   93  — Lost
//
// We collapse this to four buckets that map cleanly to our existing
// OrderStatus values: ANNOUNCED → no change, IN_TRANSIT → SHIPPED,
// DELIVERED → DELIVERED, FAILED → flag for manual review.
// ─────────────────────────────────────────────────────────────────────────

import { OrderStatus } from "@prisma/client";

export type SendcloudParcelStatusBucket =
  | "announced"
  | "in_transit"
  | "delivered"
  | "failed"
  | "unknown";

const ANNOUNCED_IDS = new Set([1]);
const IN_TRANSIT_IDS = new Set([3, 4, 5, 6, 12, 13, 92]);
const DELIVERED_IDS = new Set([11]);
const FAILED_IDS = new Set([14, 15, 62, 91, 93]);

export function bucketForStatusId(
  id: number | null | undefined,
): SendcloudParcelStatusBucket {
  if (id === null || id === undefined) return "unknown";
  if (ANNOUNCED_IDS.has(id)) return "announced";
  if (IN_TRANSIT_IDS.has(id)) return "in_transit";
  if (DELIVERED_IDS.has(id)) return "delivered";
  if (FAILED_IDS.has(id)) return "failed";
  return "unknown";
}

/**
 * Decide how the bucket should affect Order.status. Returns null when
 * the bucket shouldn't change the order's state — the webhook handler
 * uses that as "log only, don't write."
 *
 * We deliberately don't move backwards: if the order is already
 * DELIVERED and Sendcloud sends an "in transit" later (rare but
 * possible after a returned package re-ships), we ignore it.
 */
export function nextOrderStatusForBucket(
  bucket: SendcloudParcelStatusBucket,
  current: OrderStatus,
): OrderStatus | null {
  switch (bucket) {
    case "announced":
      // Label generated, parcel not yet handed to the carrier. We've
      // already moved the order to PAID via Mollie — no further change.
      return null;
    case "in_transit":
      // Don't downgrade DELIVERED back to SHIPPED.
      if (current === OrderStatus.DELIVERED) return null;
      return OrderStatus.SHIPPED;
    case "delivered":
      return OrderStatus.DELIVERED;
    case "failed":
      // Cancelled / lost / returned-to-sender. We don't auto-move the
      // order to a "failed" state because Sofia probably wants to
      // contact the customer first. The webhook handler will log
      // loudly so it surfaces in admin notifications.
      return null;
    case "unknown":
      return null;
  }
}
