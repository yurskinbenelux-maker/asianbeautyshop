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
  | { ok: true; parcelId: string; trackingNumber: string | null }
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

  // Total weight in grams → kilograms (Sendcloud expects kg as a string,
  // 3 decimal places). Default to 100g per item if Product.weightGrams
  // is null — better than sending zero, which some carriers reject.
  const totalGrams = order.items.reduce((sum, item) => {
    const each = item.product.weightGrams ?? 100;
    return sum + each * item.quantity;
  }, 0);
  const weightKg = (totalGrams / 1000).toFixed(3);

  return {
    parcel: {
      // Recipient
      name: `${a.firstName} ${a.lastName}`.trim(),
      company_name: a.company ?? "",
      address: street,
      house_number: houseNumber,
      address_2: a.line2 ?? "",
      city: a.city,
      postal_code: a.postcode,
      country: a.country,
      email: order.email,
      telephone: a.phone ?? "",

      // Identifiers — both visible in the Sendcloud panel for support.
      order_number: order.publicNumber,
      external_reference: order.id,

      // Sender side: Sofia configures Sendcloud's default sender + shipping
      // rules in their panel. apply_shipping_rules=true defers the carrier
      // choice to those rules; request_label=true generates the PDF
      // immediately so the parcel is dispatch-ready without a second call.
      apply_shipping_rules: true,
      request_label: true,

      // Cost + customs metadata — required for outside-EU shipments.
      total_order_value: Number(order.grandTotal).toFixed(2),
      total_order_value_currency: order.currency,
      weight: weightKg,

      parcel_items: order.items.map((item) => ({
        description: item.nameSnapshot,
        quantity: item.quantity,
        weight: ((item.product.weightGrams ?? 100) / 1000).toFixed(3),
        value: Number(item.unitPrice).toFixed(2),
        hs_code: item.product.hsCode ?? "",
        origin_country: item.product.originCountry ?? "",
        sku: item.skuSnapshot,
      })),
    },
  };
}

type SendcloudParcelResponse = {
  parcel: {
    id: number;
    tracking_number: string | null;
    tracking_url: string | null;
    status?: { id: number; message: string };
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
  if (!order.shippingAddress) {
    return { ok: false, reason: "no-shipping-address" };
  }

  const payload = buildParcelPayload({
    ...order,
    shippingAddress: order.shippingAddress,
  });

  try {
    const res = await sendcloudFetch<SendcloudParcelResponse>("/parcels", {
      method: "POST",
      body: payload,
    });

    const parcelId = String(res.parcel.id);
    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: {
          sendcloudParcelId: parcelId,
          trackingNumber: res.parcel.tracking_number,
          trackingUrl: res.parcel.tracking_url,
        },
      }),
      prisma.orderEvent.create({
        data: {
          orderId: order.id,
          kind: "sendcloud.parcel.created",
          metadata: {
            parcelId,
            trackingNumber: res.parcel.tracking_number,
            trackingUrl: res.parcel.tracking_url,
            status: res.parcel.status?.id ?? null,
          },
        },
      }),
    ]);

    return {
      ok: true,
      parcelId,
      trackingNumber: res.parcel.tracking_number,
    };
  } catch (err) {
    const message =
      err instanceof SendcloudError ? err.message : (err as Error).message;
    const status =
      err instanceof SendcloudError ? err.status : undefined;
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
          metadata: { message, status: status ?? null },
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
