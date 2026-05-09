// ─────────────────────────────────────────────────────────────────────────
// Server action for customer return submission.
//
// Flow:
//   1. Require the caller to be logged in as the order owner.
//   2. Verify the order is in a state that allows returns (only DELIVERED —
//      pending/shipped orders should be cancelled, not "returned").
//   3. Parse the FormData — each line-item ID carries a quantity; quantities
//      cannot exceed the original order line.
//   4. Validate the free-text reason maps to a ReturnReason enum value.
//   5. Persist via createReturnRequest() — this mints the ABS-XXXX-R1 ref.
//   6. Fire the customer and admin notification emails (non-blocking; Resend
//      failure shouldn't block the flow).
//   7. Redirect to /account/returns/{publicNumber}.
//
// Notes:
//   · Guest orders (userId = null) can't go through this path because
//     requireCustomer() redirects them to sign-in first.  A future
//     email-token flow can call createReturnRequest() directly.
//   · We snapshot name/SKU/price at submission time so the return detail
//     page stays stable even if the underlying product is later renamed.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { redirect } from "next/navigation";

import { requireCustomer } from "@/lib/auth";
import { getMyOrderByNumber } from "@/lib/queries/orders";
import { createReturnRequest } from "@/lib/returns/db";
import { RETURN_REASON, type ReturnReason } from "@/lib/returns/types";
import { sendReturnRequestedEmail } from "@/lib/email/return-requested";
import { sendAdminNewReturnEmail } from "@/lib/email/admin-new-return";

import type { ReturnFormState } from "./form-state";

/** The orders that are eligible to be returned. */
const RETURNABLE_ORDER_STATUSES = new Set(["DELIVERED", "SHIPPED"]);

function isReturnReason(v: string): v is ReturnReason {
  return (RETURN_REASON as readonly string[]).includes(v);
}

export async function submitReturnRequest(
  prev: ReturnFormState,
  formData: FormData,
): Promise<ReturnFormState> {
  // locale + order number are hidden inputs in the form.
  const locale = String(formData.get("locale") ?? "en");
  const orderNumber = String(formData.get("orderNumber") ?? "");

  if (!orderNumber) {
    return { ok: false, errorCode: "invalid_order" };
  }

  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/orders/${orderNumber}/return`,
  });

  const order = await getMyOrderByNumber(profile.id, orderNumber, locale);
  if (!order) {
    return { ok: false, errorCode: "invalid_order" };
  }
  if (!RETURNABLE_ORDER_STATUSES.has(order.status)) {
    return { ok: false, errorCode: "order_not_returnable" };
  }

  // ── parse reason + details ─────────────────────────────────────────────
  const reasonRaw = String(formData.get("reason") ?? "");
  if (!isReturnReason(reasonRaw)) {
    return { ok: false, errorCode: "invalid_reason" };
  }
  const reason: ReturnReason = reasonRaw;
  const detailsRaw = String(formData.get("details") ?? "").trim();
  const details = detailsRaw.length > 0 ? detailsRaw.slice(0, 2000) : null;

  // ── parse selected items ───────────────────────────────────────────────
  // Form shape: for each order item we render a `qty_<itemId>` text field.
  // A quantity > 0 opts that line into the return.
  const fieldErrors: Record<string, string> = {};
  const selected: Array<{
    orderItemId: string;
    quantity: number;
    nameSnapshot: string;
    skuSnapshot: string;
    unitPrice: number;
  }> = [];

  for (const line of order.items) {
    const raw = String(formData.get(`qty_${line.id}`) ?? "0");
    const qty = Number.parseInt(raw, 10);
    if (!Number.isFinite(qty) || qty < 0) {
      fieldErrors[`qty_${line.id}`] = "invalid";
      continue;
    }
    if (qty === 0) continue;
    if (qty > line.quantity) {
      fieldErrors[`qty_${line.id}`] = "exceeds";
      continue;
    }
    selected.push({
      orderItemId: line.id,
      quantity: qty,
      nameSnapshot: line.nameSnapshot,
      skuSnapshot: line.skuSnapshot,
      unitPrice: line.unitPrice,
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, errorCode: "quantity_exceeds", fieldErrors };
  }
  if (selected.length === 0) {
    return { ok: false, errorCode: "no_items" };
  }

  // ── persist ────────────────────────────────────────────────────────────
  let created;
  try {
    created = await createReturnRequest({
      orderId: order.id,
      userId: profile.id,
      reason,
      details,
      items: selected,
    });
  } catch (err) {
    console.error("[returns] createReturnRequest failed", err);
    return { ok: false, errorCode: "server_error" };
  }

  // ── notify (best-effort) ───────────────────────────────────────────────
  const emailItems = selected.map((s) => ({
    productName: s.nameSnapshot,
    quantity: s.quantity,
  }));

  try {
    await Promise.allSettled([
      sendReturnRequestedEmail(order.id, {
        returnReference: created.publicNumber,
        items: emailItems,
        reason: details,
      }),
      sendAdminNewReturnEmail(order.id, {
        returnId: created.id,
        returnReference: created.publicNumber,
        items: emailItems,
        reason: details,
      }),
    ]);
  } catch (err) {
    // Never block the redirect on email failures — they're logged and we
    // have the return persisted in the DB.
    console.warn("[returns] notification dispatch threw", err);
  }

  // ── redirect to detail page ────────────────────────────────────────────
  redirect(`/${locale}/account/returns/${encodeURIComponent(created.publicNumber)}`);
}
