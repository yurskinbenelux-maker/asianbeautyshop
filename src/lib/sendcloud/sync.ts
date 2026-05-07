// ─────────────────────────────────────────────────────────────────────────
// Sendcloud sync — turns a paid Order into a Sendcloud parcel.
//
// Called from two places:
//   1. The Mollie webhook, immediately after marking an order PAID.
//      Fire-and-forget so a Sendcloud outage can't stall payments.
//   2. An admin "retry sync" action when (1) failed.
//
// On success we write three columns onto Order:
//   sendcloudParcelId · trackingNumber · trackingUrl
// and append an OrderEvent for the audit log.
//
// Idempotency: every parcel call sends `external_reference: order.id`
// so re-runs against the same order won't create duplicate parcels —
// Sendcloud rejects the second one. We additionally bail early in code
// if the order already has a sendcloudParcelId.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isSendcloudConfigured,
  sendcloudFetch,
  SendcloudError,
} from "./client";

export type SendcloudSyncResult =
  | {
      ok: true;
      parcelId: string | null; // null when digital-only and we skipped
      trackingNumber: string | null;
      skipped?: "digital-only"; // only set when no parcel was needed
    }
  | {
      ok: false;
      reason:
        | "not-configured"
        | "order-not-found"
        | "order-not-paid"
        | "no-shipping-address"
        | "already-synced"
        | "sendcloud-error";
      message?: string;
      status?: number;
    };

/**
 * Build the parcel payload Sendcloud expects from one of our orders.
 * Pulled out so it's unit-testable without an HTTP round-trip.
 */
function buildParcelPayload(order: {
  id: string;
  publicNumber: string;
  email: string;
  grandTotal: Prisma.Decimal;
  currency: string;
  shippingAddress: {
    firstName: string;
    lastName: string;
    company: string | null;
    line1: string;
    line2: string | null;
    city: string;
    postcode: string;
    country: string;
    phone: string | null;
  };
  items: Array<{
    nameSnapshot: string;
    skuSnapshot: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    product: {
      weightGrams: number | null;
      hsCode: string | null;
      originCountry: string | null;
    };
  }>;
}) {
  const a = order.shippingAddress;

  // Split line1 into a street name + house number for Sendcloud — most
  // EU carriers want them as separate fields. We use a permissive
  // regex: "Boomsesteenweg 41/4b" → street "Boomsesteenweg", number "41/4b".
  // If we can't parse cleanly, send the whole string as `address` and
  // an empty house_number — Sendcloud's address parser handles that.
  const houseMatch = a.line1.match(/^(.*?)(?:\s+)(\d[\dA-Za-z\-\/]*)\s*$/);
  const street = houseMatch ? houseMatch[1].trim() : a.line1;
  const houseNumber = houseMatch ? houseMatch[2].trim() : "";

  // ── Package weight ──────────────────────────────────────────────────
  //
  // Total weight = Σ(product weight × quantity) + packaging tare.
  //
  // Carriers (PostNL/DPD/bpost) price by weight bracket and re-weigh at
  // intake; under-declaring means Sofia gets a surcharge bill weeks
  // later. We must include the empty box + packing tape + filler.
  //
  // Sofia has 3 box sizes registered in her Sendcloud "Boxes" panel:
  //   yurskinsolution 16 (16×16×10)   — small,  1 item
  //   yurskinsolution 19 (19×14×10)   — medium, 2-3 items
  //   yurskinsolution 30 (23.5×23.5×10) — large, 4+ items
  //
  // The empty-weight numbers below are sensible defaults for single-wall
  // corrugated boxes of those dimensions plus tape and a small amount of
  // void fill. If carriers start surcharging, weigh an actual empty box
  // and update these constants.
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
  const PACKAGING_TARE_GRAMS =
    itemCount >= 4 ? 180 : itemCount >= 2 ? 120 : 100;

  // Per-product weight: fall back to 100g/unit if weightGrams isn't set
  // in admin. Sofia should fill these in for accurate billing — TODO
  // surface a "missing weights" admin warning.
  const itemsGrams = order.items.reduce((sum, item) => {
    const each = item.product.weightGrams ?? 100;
    return sum + each * item.quantity;
  }, 0);
  const totalGrams = itemsGrams + PACKAGING_TARE_GRAMS;
  const weightKg = (totalGrams / 1000).toFixed(3);

  // Sendcloud v3 Shipments shape (POST /api/v3/shipments).
  //
  // Field map (after live 400-validation feedback from Sendcloud):
  //   • Recipient nested under `to_address`
  //   • Sender required as `from_address` — we use K'Elmus's legal entity
  //     (matches the invoice issuer snapshot in src/lib/invoices/issue.ts)
  //   • Weight units must be one of "kg" | "g" | "lbs" | "oz" — NOT
  //     "kilogram" (Sendcloud rejects "kilogram" with a strict-enum error)
  //   • Per-item declared value is `price`, not `value`
  //   • `ship_with: { type: "shipping_rules" }` defers carrier choice to
  //     Sofia's panel rules (replaces v2's `apply_shipping_rules: true`)
  return {
    // ── Recipient ─────────────────────────────────────────────────────
    to_address: {
      name: `${a.firstName} ${a.lastName}`.trim(),
      company_name: a.company ?? "",
      address_line_1: street,
      address_line_2: a.line2 ?? "",
      house_number: houseNumber,
      city: a.city,
      postal_code: a.postcode,
      country_code: a.country,
      email: order.email,
      phone_number: a.phone ?? "",
    },

    // ── Sender (K'Elmus Group BV — Sofia's legal entity) ─────────────
    // Hard-coded here for now; if Sofia ever moves we update once.
    // Long-term, this could be pulled from a Setting row keyed by
    // "sendcloud.from_address" so it's editable without a deploy.
    from_address: {
      name: "K'Elmus Group BV",
      company_name: "K'Elmus Group BV",
      address_line_1: "Boomsesteenweg",
      house_number: "41/4b",
      city: "Aartselaar",
      postal_code: "2630",
      country_code: "BE",
      email: "hello@asianbeautyshop.eu",
      phone_number: "",
    },

    // ── Carrier selection ────────────────────────────────────────────
    //
    // v3 requires `ship_with` to be structurally valid even when we want
    // panel rules to pick the real carrier. James from Sendcloud support
    // confirmed the canonical pattern: pass `sendcloud:letter` as a
    // placeholder shipping_option_code, then set `apply_shipping_rules:
    // true` — the rules engine overrides the placeholder with whatever
    // Sofia's panel rules dictate (PostNL for BE/NL, etc.).
    //
    // We never want a real letter shipped — the placeholder is just to
    // satisfy schema validation; if rules don't match for some reason,
    // Sendcloud will surface the issue rather than silently shipping a
    // letter (`sendcloud:letter` is a special "unstamped letter" tier
    // designed for exactly this purpose).
    ship_with: {
      type: "shipping_option_code",
      properties: {
        shipping_option_code: "sendcloud:letter",
      },
    },
    apply_shipping_rules: true,

    // ── Identifiers ──────────────────────────────────────────────────
    // `order_number` is what Sofia sees in the panel; `external_reference`
    // is what Sendcloud dedupes against on retry.
    order_number: order.publicNumber,
    external_reference: order.id,

    // ── Declared value (for customs on non-EU destinations) ──────────
    total_order_value: {
      value: Number(order.grandTotal).toFixed(2),
      currency: order.currency,
    },

    // ── Parcels (single-collo for now) ───────────────────────────────
    parcels: [
      {
        weight: {
          value: weightKg,
          unit: "kg",
        },
        parcel_items: order.items.map((item) => ({
          description: item.nameSnapshot,
          quantity: item.quantity,
          weight: {
            value: ((item.product.weightGrams ?? 100) / 1000).toFixed(3),
            unit: "kg",
          },
          // v3 calls this `price` (not `value` like v2 did).
          price: {
            value: Number(item.unitPrice).toFixed(2),
            currency: order.currency,
          },
          hs_code: item.product.hsCode ?? "",
          origin_country: item.product.originCountry ?? "",
          sku: item.skuSnapshot,
        })),
      },
    ],
  };
}

// v3 response — the synchronous "create + announce" endpoint returns
// the created shipment with its parcels. Tracking number is on the
// (single) parcel element. Field names are best-effort based on v3
// docs and may need a one-line tweak after the first real call —
// we log the raw body in the OrderEvent on failure so we can adjust.
type SendcloudShipmentResponse = {
  data: {
    id: number | string;
    parcels?: Array<{
      id: number | string;
      tracking_number?: string | null;
      tracking_url?: string | null;
      status?: { id?: number; message?: string };
    }>;
    // Some v3 endpoints surface tracking on the shipment root too —
    // we read whichever is populated.
    tracking_number?: string | null;
    tracking_url?: string | null;
  };
};

/**
 * Push an order to Sendcloud. Idempotent + safe to retry. Writes
 * sendcloudParcelId / trackingNumber / trackingUrl on success and
 * appends an OrderEvent (`sendcloud.parcel.created` or
 * `sendcloud.parcel.failed`) for the audit log.
 */
export async function syncOrderToSendcloud(
  orderId: string,
): Promise<SendcloudSyncResult> {
  if (!isSendcloudConfigured()) {
    return { ok: false, reason: "not-configured" };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      publicNumber: true,
      email: true,
      grandTotal: true,
      currency: true,
      status: true,
      sendcloudParcelId: true,
      shippingAddress: {
        select: {
          firstName: true,
          lastName: true,
          company: true,
          line1: true,
          line2: true,
          city: true,
          postcode: true,
          country: true,
          phone: true,
        },
      },
      items: {
        select: {
          nameSnapshot: true,
          skuSnapshot: true,
          quantity: true,
          unitPrice: true,
          product: {
            select: {
              kind: true,
              weightGrams: true,
              hsCode: true,
              originCountry: true,
            },
          },
        },
      },
    },
  });

  if (!order) return { ok: false, reason: "order-not-found" };
  if (order.sendcloudParcelId) {
    // Already pushed; expose as a successful no-op so retry buttons
    // don't appear "broken" to the admin.
    return {
      ok: true,
      parcelId: order.sendcloudParcelId,
      trackingNumber: null,
    };
  }
  if (
    order.status !== OrderStatus.PAID &&
    order.status !== OrderStatus.SHIPPED
  ) {
    return { ok: false, reason: "order-not-paid" };
  }

  // Digital-only orders (every line is a gift card) have nothing to ship.
  // Skip cleanly so the Mollie webhook's `Promise.allSettled([..., sync])`
  // doesn't log a false-negative, and Sofia doesn't see a phantom parcel
  // in her Sendcloud dashboard.
  const hasPhysical = order.items.some(
    (i) => i.product.kind !== "GIFT_CARD",
  );
  if (!hasPhysical) {
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: "shipping.skipped",
        message: "Digital-only order — no parcel needed",
      },
    });
    return {
      ok: true,
      parcelId: null,
      trackingNumber: null,
      skipped: "digital-only",
    };
  }

  if (!order.shippingAddress) {
    return { ok: false, reason: "no-shipping-address" };
  }

  const payload = buildParcelPayload({
    ...order,
    shippingAddress: order.shippingAddress,
  });

  try {
    // v3 endpoint James from Sendcloud support pointed us at:
    //   "Create a shipment with rules and/or defaults and announce it
    //    synchronously" — single call that creates the shipment, applies
    //    Sofia's panel shipping rules, and generates the label.
    // The actual v3 endpoint is just `POST /api/v3/shipments` — James
    // from Sendcloud support confirmed. The long slug we saw earlier
    // (".../create-a-shipment-with-rules-and-or-default-and-announce-it-
    // synchronously") was the docs page URL, not the API path. The
    // request body's `apply_shipping_rules: true` is what selects the
    // "with rules + announce synchronously" operation server-side.
    const res = await sendcloudFetch<SendcloudShipmentResponse>(
      "/shipments",
      {
        method: "POST",
        body: payload,
      },
    );

    // Tracking lives on the (single) parcel inside the shipment, but
    // some v3 endpoints surface it on the root too — read whichever is
    // populated first. The shipment id is what we record as our
    // sendcloudParcelId (stable across the parcel lifecycle).
    const shipment = res.data;
    const firstParcel = shipment.parcels?.[0];
    const parcelId = String(shipment.id);
    const trackingNumber =
      firstParcel?.tracking_number ?? shipment.tracking_number ?? null;
    const trackingUrl =
      firstParcel?.tracking_url ?? shipment.tracking_url ?? null;

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: {
          sendcloudParcelId: parcelId,
          trackingNumber,
          trackingUrl,
        },
      }),
      prisma.orderEvent.create({
        data: {
          orderId: order.id,
          kind: "sendcloud.parcel.created",
          metadata: {
            parcelId,
            trackingNumber,
            trackingUrl,
            innerParcelId: firstParcel?.id ? String(firstParcel.id) : null,
            status: firstParcel?.status?.id ?? null,
          },
        },
      }),
    ]);

    return {
      ok: true,
      parcelId,
      trackingNumber,
    };
  } catch (err) {
    const message =
      err instanceof SendcloudError ? err.message : (err as Error).message;
    const status =
      err instanceof SendcloudError ? err.status : undefined;
    // Capture the raw response body too — v3 returns per-field validation
    // errors that we need to see to tune the payload (we built it from
    // docs descriptions, not a sanctioned curl example).
    const body =
      err instanceof SendcloudError ? err.body : undefined;
    console.error(
      `[sendcloud] sync failed for ${order.publicNumber}: ${message}`,
    );
    // Audit-log failures so we can investigate — without poisoning the
    // order's mutable state.
    await prisma.orderEvent
      .create({
        data: {
          orderId: order.id,
          kind: "sendcloud.parcel.failed",
          metadata: {
            message,
            status: status ?? null,
            // Only stash the body when Sendcloud actually sent one —
            // network/timeout errors don't have a parsed payload.
            ...(body !== undefined
              ? { body: body as Prisma.InputJsonValue }
              : {}),
          },
        },
      })
      .catch(() => undefined);
    return {
      ok: false,
      reason: "sendcloud-error",
      message,
      status,
    };
  }
}
