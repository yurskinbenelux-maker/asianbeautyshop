// ─────────────────────────────────────────────────────────────────────────
// Admin-side return actions — status transitions and notes/refund edits.
//
// Rules:
//   · requireAdmin() at the top of each action.
//   · transitionReturnStatus() inside lib/returns/db.ts enforces the
//     ALLOWED_TRANSITIONS map, so we don't have to re-check here.
//   · After a successful transition we fire the matching email:
//       APPROVED  → sendReturnApprovedEmail (selfPostage default; A2
//                    promotes to prepaidLabel mode on Sendcloud success)
//       RECEIVED  → sendReturnReceivedEmail
//       REFUNDED  → sendOrderRefundedEmail (existing template)
//       REJECTED  → sendReturnRejectedEmail (A8 — surfaces adminNotes)
//       CANCELLED → sendReturnCancelledEmail (A8 — admin- and self-cancel)
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit/log";
import {
  getReturnByIdForAdmin,
  transitionReturnStatus,
  updateReturnAdminFields,
} from "@/lib/returns/db";
import { RETURN_STATUS, type ReturnStatus } from "@/lib/returns/types";
import { sendReturnApprovedEmail } from "@/lib/email/return-approved";
import { sendReturnReceivedEmail } from "@/lib/email/return-received";
import { sendReturnRejectedEmail } from "@/lib/email/return-rejected";
import { sendReturnCancelledEmail } from "@/lib/email/return-cancelled";
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

    // H1 hard gate (Max's request): refuse to flip to RECEIVED without
    // a refund amount on file. Previously the action would silently
    // skip the refund pipeline and leave the customer un-refunded — a
    // serious UX trap. With this gate, admin gets bounced back to the
    // detail page and the form's status banner (H3) will explain that
    // a refund amount is required first. Belt-and-braces against an
    // unsaved form value (e.g. admin types the amount but forgets to
    // click Save on the patch form before hitting Mark Received).
    const checkAmount = Number(current.refundAmount ?? 0);
    if (checkAmount <= 0) {
      console.warn(
        `[admin-returns] RECEIVED blocked — refundAmount missing for return ${returnId}. Admin must save the refund amount in the form FIRST, then click Mark Received.`,
      );
      revalidatePath(`/admin/returns/${returnId}`);
      redirect(`/admin/returns/${returnId}?error=refund_amount_required`);
    }
    // Skip refund issuance only when the admin has no refund amount on
    // file yet — that's the "received but I haven't decided the refund
    // yet" workflow. Form should require this field, but we tolerate
    // the legacy empty-value case (existing returns) gracefully.
    //
    // H1: log the short-circuit branch explicitly so future silence is
    // grep-able in Hostinger logs. Previously a silent skip looked
    // identical to a successful run.
    const amount = Number(current.refundAmount ?? 0);
    if (amount <= 0) {
      console.warn(
        `[admin-returns] RECEIVED: skipping refund — refundAmount is ${amount} for return ${returnId}. Set a refund amount in the form before marking received.`,
      );
    } else if (current.mollieRefundId) {
      console.info(
        `[admin-returns] RECEIVED: refund already issued (Mollie ${current.mollieRefundId}) for return ${returnId} — idempotent skip.`,
      );
    }
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
      // H8: self-postage is now the canonical path. Customer pays the
      // return shipping with the carrier of their choice and sends us
      // the tracking number. We deliberately do NOT call
      // createSendcloudReturnLabel anymore because:
      //   · Sendcloud's free plan blocks programmatic return creation;
      //     the fallback was always firing in production.
      //   · The customer-facing copy (return-requested + return-
      //     approved) is now consistent on self-postage. Promising
      //     "we'll send you a label" in email #1 and then falling
      //     back to "ship at your own cost" in email #2 was a
      //     confusing UX contradiction.
      //   · Eliminates a wasted Sendcloud API call on every approve.
      //
      // If we ever upgrade Sendcloud to a plan that includes returns
      // (task C1 / #340), this is the place to re-introduce the label
      // attempt and switch the email mode dynamically based on the
      // result. The email template still supports prepaidLabel +
      // damagedReplace modes for that future path.
      await sendReturnApprovedEmail(updated.orderId, {
        returnReference: updated.publicNumber,
        items: emailItems,
        mode: "selfPostage",
        prepaidLabelUrl: null,
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
    } else if (targetRaw === "REJECTED") {
      // A8: rejection email surfaces adminNotes verbatim — Belgian
      // consumer law (Code de droit économique VI.83) requires us to
      // explain WHY the return was refused. The fallback copy is
      // generic-but-not-empty in case admin clicked Reject without
      // typing notes.
      await sendReturnRejectedEmail(updated.orderId, {
        returnReference: updated.publicNumber,
        adminNotes: updated.adminNotes,
      });
    } else if (targetRaw === "CANCELLED") {
      // A8: same email covers both admin- and customer-self-cancel
      // paths (the customer-self-cancel goes through cancelReturnAction
      // which calls cancelReturnAsCustomer → transitionReturnStatus,
      // but doesn't fire emails itself; this branch covers admin-
      // triggered cancellations). For self-cancel notifications we
      // could also wire the customer action separately — for now the
      // self-cancel customer is the actor and doesn't need an email
      // to confirm what they just did.
      await sendReturnCancelledEmail(updated.orderId, {
        returnReference: updated.publicNumber,
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

  // H1 fix: route through updateReturnAdminFields, NOT
  // transitionReturnStatus. The old code passed `current.status` as
  // the target (a self-transition) which the canTransition guard
  // forbade for every status — so every save silently threw and the
  // admin saw blank fields after refresh. This was the bug behind the
  // entire refund pipeline being silent: with refundAmount never
  // persisted, A1's "Mark received" short-circuit hit (amount === 0)
  // and Mollie / credit note / loyalty clawback / VAT subtraction all
  // skipped without warning.
  try {
    await updateReturnAdminFields(returnId, {
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
