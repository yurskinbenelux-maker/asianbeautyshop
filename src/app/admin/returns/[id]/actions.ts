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

import { prisma } from "@/lib/prisma";
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

// ─────────────────────────────────────────────────────────────────────────
// Step 3: per-item refund adjudication.
//
// Replaces the legacy single "Refund amount" input. Admin now decides, for
// EACH return item, what amount (if any) to refund and — when rejecting —
// the reason that gets shown to the customer in the 'return received'
// email so reality and expectations line up.
//
// FormData shape (form fields built by ReturnAdjudicationForm):
//   returnId: <uuid>
//   item.<itemId>.accept: "yes" | "no"   (toggle)
//   item.<itemId>.amount: "<eur>"        (number, only meaningful when accept=yes)
//   item.<itemId>.reason: "<text>"       (only meaningful when accept=no)
//
// Server-side rules:
//   · Gift cards: amount is forced to 0 + reason is forced to
//     "Non-refundable gift card" regardless of what the form posted.
//     Belt-and-braces in case any UI guard is bypassed.
//   · Non-numeric amounts → treated as 0 (no refund) instead of
//     bailing — admin's intent was "approve this line at €0".
//   · Total refund stored on ReturnRequest.refundAmount = SUM of
//     per-item acceptedRefundEur, so the existing transition gate
//     (refundAmount > 0) still works without rewiring.
// ─────────────────────────────────────────────────────────────────────────
export async function updateReturnAdjudicationAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireAdmin();

  const returnId = String(formData.get("returnId") ?? "");
  if (!returnId) return;

  const current = await getReturnByIdForAdmin(returnId);
  if (!current) return;

  // Walk every return item, read its three form fields, normalise.
  type Decision = {
    itemId: string;
    acceptedRefundEur: number;
    rejectionReason: string | null;
  };
  const decisions: Decision[] = [];

  for (const it of current.items) {
    const acceptKey = `item.${it.id}.accept`;
    const amountKey = `item.${it.id}.amount`;
    const reasonKey = `item.${it.id}.reason`;

    const acceptRaw = String(formData.get(acceptKey) ?? "yes").toLowerCase();
    const amountRaw = String(formData.get(amountKey) ?? "");
    const reasonRaw = String(formData.get(reasonKey) ?? "").trim();

    // Gift cards are forcibly rejected — the form should already
    // disable the inputs, but this is the final safety net so a
    // hand-crafted POST can't sneak a refund through.
    if (it.productKind === "GIFT_CARD") {
      decisions.push({
        itemId: it.id,
        acceptedRefundEur: 0,
        rejectionReason: "Non-refundable gift card",
      });
      continue;
    }

    if (acceptRaw === "no") {
      decisions.push({
        itemId: it.id,
        acceptedRefundEur: 0,
        rejectionReason: reasonRaw.slice(0, 120) || "Not accepted",
      });
      continue;
    }

    // Accepted. Parse amount; default to 0 on bad input so we don't
    // silently refund the line total on a malformed submit.
    const parsed = Number.parseFloat(amountRaw.replace(",", "."));
    const amount = Number.isFinite(parsed) && parsed > 0
      ? Math.round(parsed * 100) / 100
      : 0;

    decisions.push({
      itemId: it.id,
      acceptedRefundEur: amount,
      // Even on accepted lines, persist a reason if the admin typed
      // one (e.g. "Approved at reduced amount — slight damage"). Null
      // otherwise so the email template can branch cleanly.
      rejectionReason: reasonRaw ? reasonRaw.slice(0, 120) : null,
    });
  }

  const total = decisions.reduce((sum, d) => sum + d.acceptedRefundEur, 0);

  // Persist all per-item amounts + roll up to ReturnRequest.refundAmount
  // in one transaction so the page never sees a half-written state.
  await prisma.$transaction([
    ...decisions.map((d) =>
      prisma.returnItem.update({
        where: { id: d.itemId },
        data: {
          acceptedRefundEur: d.acceptedRefundEur,
          rejectionReason: d.rejectionReason,
        },
      }),
    ),
    prisma.returnRequest.update({
      where: { id: returnId },
      data: { refundAmount: total },
    }),
  ]);

  await logAudit({
    actor,
    action: "return.adjudicate",
    entityType: "ReturnRequest",
    entityId: returnId,
    summary: `Adjudicated ${current.publicNumber} — total accepted €${total.toFixed(2)} across ${decisions.length} item${decisions.length === 1 ? "" : "s"}`,
    meta: {
      decisions: decisions.map((d) => ({
        itemId: d.itemId,
        eur: d.acceptedRefundEur,
        reason: d.rejectionReason,
      })),
    },
  });

  revalidatePath(`/admin/returns/${returnId}`);
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
      // Step 6 (2026-05): hand the email the per-item adjudication so it
      // can render the accepted-with-EUR vs rejected-with-reason split
      // the customer actually expects after Step 3's admin form. The
      // generic {productName, quantity} shape used for the approval
      // email isn't enough here — the customer needs the reason text
      // and the per-line EUR to make sense of a partial refund.
      const richItems = updated.items.map((it) => ({
        productName: it.nameSnapshot,
        quantity: it.quantity,
        acceptedRefundEur: it.acceptedRefundEur,
        rejectionReason: it.rejectionReason,
      }));
      const refundTotalEur = updated.items.reduce(
        (s, it) => s + (it.acceptedRefundEur ?? 0),
        0,
      );
      await sendReturnReceivedEmail(updated.orderId, {
        returnReference: updated.publicNumber,
        items: richItems,
        refundTotalEur,
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
