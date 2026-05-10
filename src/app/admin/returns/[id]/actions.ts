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
//     REJECTED / CANCELLED don't auto-notify — an admin replies by hand.
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
import {
  issueRefundAndCreditNote,
  IssueRefundError,
} from "@/lib/credit-notes/issue";

function isReturnStatus(v: string): v is ReturnStatus {
  return (RETURN_STATUS as readonly string[]).includes(v);
}

export async function transitionReturnAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();

  const returnId = String(formData.get("returnId") ?? "");
  const targetRaw = String(formData.get("target") ?? "");
  if (!returnId || !isReturnStatus(targetRaw)) return;

  // ── A1: refund + credit note on the RECEIVED transition ─────────────
  // We fire the Mollie refund + CN-2026-NNNNN write BEFORE the status
  // flip — if the refund fails (Mollie down, no Mollie payment, no
  // invoice on the order), we want the admin to see the error and the
  // status to stay where it was, not be left in RECEIVED with no money
  // moved. issueRefundAndCreditNote is idempotent on
  // ReturnRequest.mollieRefundId so a re-clicked button is safe.
  if (targetRaw === "RECEIVED") {
    const current = await getReturnByIdForAdmin(returnId);
    if (!current) {
      console.error("[admin-returns] RECEIVED: return not found", returnId);
      return;
    }
    // Skip refund issuance only when the admin has no refund amount on
    // file yet — that's the "received but I haven't decided the refund
    // yet" workflow. Form should require this field, but we tolerate
    // the legacy empty-value case (existing returns) gracefully.
    const amount = Number(current.refundAmount ?? 0);
    if (amount > 0 && !current.mollieRefundId) {
      try {
        const result = await issueRefundAndCreditNote({
          returnId,
          refundAmount: amount,
          reason: "RETURN",
          actorId: actor.id,
          actorEmail: actor.email ?? null,
        });
        console.info(
          `[admin-returns] refund issued · ${result.creditNoteNumber} · Mollie ${result.mollieRefundId}`,
        );
      } catch (err) {
        if (err instanceof IssueRefundError) {
          console.error(
            `[admin-returns] refund failed (${err.code}): ${err.message}`,
          );
        } else {
          console.error("[admin-returns] refund threw", err);
        }
        // Bail out — don't flip to RECEIVED with money still owed. Admin
        // sees the un-flipped status and can read the error in the
        // server log / next iteration of A8 will surface it as a banner
        // on the return detail page.
        return;
      }
    }
  }

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
