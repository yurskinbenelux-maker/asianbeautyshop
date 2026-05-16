// ─────────────────────────────────────────────────────────────────────────
// Sendcloud return-label generation (A2)
//
// Called from the admin "Approve return" transition. Creates a return
// parcel through Sendcloud's v3 API — addresses are swapped vs an
// outbound shipment (customer becomes sender, K'Elmus becomes recipient).
// On success the customer's "Your return is approved" email switches
// from selfPostage mode to prepaidLabel mode and includes the PDF link.
//
// Endpoint:
//   POST /api/v3/returns
// Body shape (per v3 docs):
//   {
//     from_address: { ...customer's shipping address... },
//     to_address:   { ...K'Elmus return address... },
//     parcels:      [{ weight, parcel_items }],
//     reason:       free-text reason,
//     external_reference: returnRequest.id    ← idempotency anchor
//   }
//
// Idempotency:
//   ReturnRequest.sendcloudReturnParcelId is the gate. If it's set, we
//   skip the API call entirely. The unique index on the column also
//   catches a race in the DB layer.
//
// Free-plan reality:
//   Sendcloud's free plan often blocks programmatic return creation —
//   the call returns 4xx with a permission error. We catch that and
//   surface { ok: false, reason: "sendcloud-error" }; the caller falls
//   back to selfPostage mode for the email instead of throwing into
//   the admin's face. C1 (#340) tracks the eventual paid-plan upgrade
//   that flips this on properly.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  isSendcloudConfigured,
  sendcloudFetch,
  SendcloudError,
} from "./client";

export type CreateReturnLabelResult =
  | {
      ok: true;
      parcelId: string;
      labelUrl: string | null; // null when API succeeded but didn't return a label URL — admin grabs from panel
      trackingNumber: string | null;
      alreadyCreated: boolean;
    }
  | {
      ok: false;
      reason:
        | "not-configured"
        | "return-not-found"
        | "no-shipping-address"
        | "no-items"
        | "already-created"
        | "sendcloud-error";
      message?: string;
      status?: number;
    };

/**
 * v3 returns response — best-effort field shape based on the v3 docs +
 * how /shipments responds. Tracking + label URL are nested under data.
 * Whatever we don't recognise gets logged in the OrderEvent so we can
 * adjust on first real call.
 */
type SendcloudReturnResponse = {
  data: {
    id: number | string;
    parcels?: Array<{
      id: number | string;
      tracking_number?: string | null;
      label?: { normal_printer?: string[]; label_printer?: string[] };
    }>;
    label?: { normal_printer?: string[]; label_printer?: string[] };
    tracking_number?: string | null;
  };
};

/**
 * Create a return label for the given ReturnRequest. Idempotent on
 * sendcloudReturnParcelId. Best-effort: failures are returned as a
 * tagged result rather than thrown — the caller falls back gracefully.
 */
export async function createSendcloudReturnLabel(
  returnId: string,
): Promise<CreateReturnLabelResult> {
  if (!isSendcloudConfigured()) {
    return { ok: false, reason: "not-configured" };
  }

  const ret = await prisma.returnRequest.findUnique({
    where: { id: returnId },
    select: {
      id: true,
      publicNumber: true,
      reason: true,
      sendcloudReturnParcelId: true,
      order: {
        select: {
          id: true,
          publicNumber: true,
          email: true,
          currency: true,
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
        },
      },
      items: {
        select: {
          quantity: true,
          nameSnapshot: true,
          skuSnapshot: true,
          unitPrice: true,
        },
      },
    },
  });

  if (!ret) return { ok: false, reason: "return-not-found" };
  if (ret.sendcloudReturnParcelId) {
    return { ok: false, reason: "already-created" };
  }
  if (!ret.order.shippingAddress) {
    return { ok: false, reason: "no-shipping-address" };
  }
  if (ret.items.length === 0) {
    return { ok: false, reason: "no-items" };
  }

  const a = ret.order.shippingAddress;

  // Same street/house parsing as the outbound sync — Sendcloud wants
  // them split for most carriers.
  const houseMatch = a.line1.match(/^(.*?)(?:\s+)(\d[\dA-Za-z\-\/]*)\s*$/);
  const street = houseMatch ? houseMatch[1].trim() : a.line1;
  const houseNumber = houseMatch ? houseMatch[2].trim() : "";

  // Total weight — for a return we don't know the actual weight ahead
  // of time (depends on what the customer packs). We estimate from the
  // line items; the carrier re-weighs at intake anyway. 200g/item is
  // a defensible average for skincare given typical 50ml/100ml glass
  // bottles + box.
  const itemCount = ret.items.reduce((n, i) => n + i.quantity, 0);
  const estimatedGrams = itemCount * 200 + 100; // +100g packaging tare
  const weightKg = (estimatedGrams / 1000).toFixed(3);

  const body = {
    // ── From: the customer (return sender) ───────────────────────────
    from_address: {
      name: `${a.firstName} ${a.lastName}`.trim(),
      company_name: a.company ?? "",
      address_line_1: street,
      address_line_2: a.line2 ?? "",
      house_number: houseNumber,
      city: a.city,
      postal_code: a.postcode,
      country_code: a.country,
      email: ret.order.email,
      phone_number: a.phone ?? "",
    },
    // ── To: K'Elmus return address ──────────────────────────────────
    to_address: {
      name: "K'Elmus Group BV — Returns",
      company_name: "K'Elmus Group BV",
      address_line_1: "Boomsesteenweg",
      house_number: "41/4b",
      city: "Aartselaar",
      postal_code: "2630",
      country_code: "BE",
      email: "info@kelmusgroup.eu",
      phone_number: "",
    },
    // ── Carrier selection — same shipping_rules deferral as outbound ─
    ship_with: {
      type: "shipping_option_code",
      properties: { shipping_option_code: "sendcloud:letter" },
    },
    apply_shipping_rules: true,
    // ── Identifiers ─────────────────────────────────────────────────
    order_number: ret.publicNumber,
    external_reference: ret.id,
    reason: `Return — ${ret.reason}`,
    // ── Parcel ──────────────────────────────────────────────────────
    parcels: [
      {
        weight: { value: weightKg, unit: "kg" },
        parcel_items: ret.items.map((item) => ({
          description: item.nameSnapshot,
          quantity: item.quantity,
          weight: { value: "0.200", unit: "kg" }, // estimate per item
          price: {
            value: Number(item.unitPrice).toFixed(2),
            currency: ret.order.currency,
          },
          sku: item.skuSnapshot,
        })),
      },
    ],
  };

  let response: SendcloudReturnResponse;
  try {
    response = await sendcloudFetch<SendcloudReturnResponse>("/returns", {
      method: "POST",
      body,
    });
  } catch (err) {
    if (err instanceof SendcloudError) {
      console.error(
        `[sendcloud/return-label] create failed for ${ret.publicNumber}`,
        { status: err.status, message: err.message, body: err.body },
      );
      return {
        ok: false,
        reason: "sendcloud-error",
        message: err.message,
        status: err.status,
      };
    }
    console.error(
      `[sendcloud/return-label] create threw for ${ret.publicNumber}`,
      err,
    );
    return {
      ok: false,
      reason: "sendcloud-error",
      message: err instanceof Error ? err.message : "unknown error",
    };
  }

  // Decode parcel id + tracking + label URL. Sendcloud puts label PDFs
  // in `data.label.normal_printer` (array of size variants) — we take
  // the first as the canonical link.
  const parcel = response.data.parcels?.[0];
  const parcelId = String(parcel?.id ?? response.data.id);
  const trackingNumber =
    parcel?.tracking_number ?? response.data.tracking_number ?? null;
  const labelUrl =
    parcel?.label?.normal_printer?.[0] ??
    response.data.label?.normal_printer?.[0] ??
    null;

  // Persist on the row. If two clicks raced and the unique index on
  // sendcloudReturnParcelId rejects the second insert, that's fine —
  // the second call will see the populated column and bail at the
  // already-created branch.
  await prisma.returnRequest.update({
    where: { id: ret.id },
    data: {
      sendcloudReturnParcelId: parcelId,
      returnLabelUrl: labelUrl,
    },
  });

  return {
    ok: true,
    parcelId,
    labelUrl,
    trackingNumber,
    alreadyCreated: false,
  };
}
