// ─────────────────────────────────────────────────────────────────────────
// Admin-side return actions — status transitions and notes/refund edits.
//
// Rules:
//   · requireAdmin() at the top of each action.
//   · transitionReturnStatus() inside lib/returns/db.ts enforces the
//     ALLOWED_TRANSITIONS map, so we don't have to re-check here.
//   · After a successful transition we fire the matching email:
//       APPROVED → sendReturnApprovedEmail (mode: selfPostage by default —
//                   admin can send a prepaid label later if needed)
//       RECEIVED → sendReturnReceivedEmail
//       REFUNDED → sendOrderRefundedEmail (existing template)
//     REJECTED / CANCELLED don't auto-notify — Sofia replies by hand.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit/log";
import {
  getReturnByIdForAdmin,
  transitionReturnStatus,
} from "@/lib/returns/db";
import { RETURN_STATUS, type ReturnStatus } from "@/lib/returns/types";
import { sendReturnApprovedEmail } from "@/lib/email/return-approved";
import { sendReturnReceivedEmail } from "@/lib/email/return-received";
import { sendOrderRefundedEmail } from "@/lib/email/order-refunded";

function isReturnStatus(v: string): v is ReturnStatus {
  return (RETURN_STATUS as readonly string[]).includes(v);
}

export async function transitionReturnAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const returnId = String(formData.get("returnId") ?? "");
  const targetRaw = String(formData.get("target") ?? "");
  if (!returnId || !isReturnStatus(targetRaw)) return;

  let updated;
  try {
    updated = await transitionReturnStatus(returnId, targetRaw, {
      actorId: actor.id,
      actorEmail: actor.email ?? null,
    });
  } catch (err) {
    console.error("[admin-returns] transition failed", err);
    return;
  }

  // Audit — capture the status transition itself; stock movements are
  // already captured in InventoryMovement when RECEIVED restocks.
  await logAudit({
    actor,
    action: `return.${targetRaw.toLowerCase()}`,
    entityType: "ReturnRequest",
    entityId: returnId,
    summary: `Return ${updated.publicNumber} → ${targetRaw}`,
    meta: {
      target: targetRaw,
      orderId: updated.orderId,
    },
  });

  // Fire the matching email best-effort.
  const emailItems = updated.items.map((it) => ({
    productName: it.nameSnapshot,
    quantity: it.quantity,
  }));

  try {
    if (targetRaw === "APPROVED") {
      await sendReturnApprovedEmail(updated.orderId, {
        returnReference: updated.publicNumber,
        items: emailItems,
        mode: "selfPostage",
      });
    } else if (targetRaw === "RECEIVED") {
      await sendReturnReceivedEmail(updated.orderId, {
        returnReference: updated.publicNumber,
        items: emailItems,
        receivedAt: updated.receivedAt ?? new Date(),
      });
    } else if (targetRaw === "REFUNDED") {
      await sendOrderRefundedEmail(updated.orderId, {
        kind: "full",
        amount: updated.refundAmount ?? 0,
      });
    }
  } catch (err) {
    console.warn("[admin-returns] transition notification threw", err);
  }

  revalidatePath("/admin/returns");
  revalidatePath(`/admin/returns/${returnId}`);
  redirect(`/admin/returns/${returnId}`);
}

export async function updateReturnNotesAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const returnId = String(formData.get("returnId") ?? "");
  if (!returnId) return;

  const current = await getReturnByIdForAdmin(returnId);
  if (!current) return;

  const adminNotes = normaliseText(formData.get("adminNotes"));
  const trackingNumber = normaliseText(formData.get("trackingNumber"));
  const trackingUrl = normaliseText(formData.get("trackingUrl"));
  const refundAmount = parseAmount(formData.get("refundAmount"));

  // The transitionReturnStatus helper is also our "patch" path — call it
  // with `current.status` (a no-op transition) so we share the same
  // DB code-path and revalidation.
  try {
    await transitionReturnStatus(returnId, current.status, {
      adminNotes,
      trackingNumber,
      trackingUrl,
      refundAmount,
    });
  } catch (err) {
    console.error("[admin-returns] notes/patch update failed", err);
  }

  revalidatePath(`/admin/returns/${returnId}`);
  redirect(`/admin/returns/${returnId}`);
}

function normaliseText(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function parseAmount(v: FormDataEntryValue | null): number | null {
  if (v === null || v === "") return null;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
