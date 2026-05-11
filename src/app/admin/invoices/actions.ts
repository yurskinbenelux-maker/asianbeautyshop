// ─────────────────────────────────────────────────────────────────────────
// Server actions for /admin/invoices (B1)
//
// Two surfaces:
//   • deleteInvoiceAction — destructive, gated behind a typed
//     confirmation matching the exact invoice number. The Belgian
//     retention requirement (Code de droit économique III.86 — 10
//     years for accounting books, Code TVA Art. 60 — 7 years for the
//     VAT-side documents) means deleting an issued invoice is almost
//     never legally OK in production. The button exists only for the
//     pre-launch cleanup window (#369) and the rare correction case
//     where a duplicate invoice slipped through.
//
// Why the confirmation pattern matches /admin/customers Danger Zone:
//   Same "type the literal identifier" approach prevents accidental
//   clicks. Admin must type "INV-2026-00042" to delete invoice
//   INV-2026-00042 — fat-fingering anything else trips the validator.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit/log";
import { INVOICES_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const DeleteSchema = z.object({
  invoiceId: z.string().uuid(),
  /** Must match the invoice's `number` field exactly — typed by admin
   *  in a free-text input. Anything else aborts the delete. */
  confirm: z.string().min(1),
});

export async function deleteInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = DeleteSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Type the invoice number to confirm.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // ── 1. Load the invoice so we can match the typed phrase against
  //      its number AND grab the PDF path for storage cleanup. ──────
  const invoice = await prisma.invoice.findUnique({
    where: { id: parsed.data.invoiceId },
    select: {
      id: true,
      number: true,
      orderId: true,
      pdfPath: true,
      year: true,
      grandTotal: true,
      destinationCountry: true,
      // CreditNote rows cascade via the schema's onDelete; we count
      // them here so the audit summary mentions the side-effect.
      creditNotes: { select: { id: true, number: true } },
    },
  });
  if (!invoice) {
    return { ok: false, message: "Invoice not found." };
  }

  // ── 2. Confirmation phrase must match exactly. Trim only — case
  //      and dash-vs-space matters. ──────────────────────────────────
  if (parsed.data.confirm.trim() !== invoice.number) {
    return {
      ok: false,
      message: `Type "${invoice.number}" exactly to confirm.`,
      fieldErrors: { confirm: ["Doesn't match the invoice number."] },
    };
  }

  // ── 3. Delete the Storage object FIRST — best-effort, not gating.
  //      If Storage is down we still proceed with the DB delete; the
  //      orphan PDF can be removed by hand from the bucket later.
  //      Doing Storage first means the DB row's pdfPath is still valid
  //      until the row itself is gone (no broken-link state). ────────
  if (invoice.pdfPath) {
    try {
      await supabaseAdmin().storage.from(INVOICES_BUCKET).remove([invoice.pdfPath]);
    } catch (err) {
      console.error("[admin/invoices] storage cleanup failed", {
        invoice: invoice.number,
        path: invoice.pdfPath,
        err,
      });
    }
  }

  // ── 4. Delete the row. CreditNotes (and their items + PDFs paths)
  //      cascade via schema's onDelete: Cascade. We deliberately don't
  //      delete the CreditNote PDFs from Storage because admin almost
  //      never deletes an invoice that has issued credit notes against
  //      it (see retention warning) — and if they do, the audit log
  //      flags it for manual cleanup. ──────────────────────────────
  await prisma.invoice.delete({ where: { id: invoice.id } });

  // ── 5. Clear the back-pointer on Order so the order page doesn't
  //      try to download a non-existent invoice. ──────────────────
  await prisma.order
    .update({
      where: { id: invoice.orderId },
      data: { invoiceUrl: null },
    })
    .catch(() => undefined);

  // ── 6. Audit trail — gives the accountant + auditor visibility
  //      into the rare deletes. The summary mentions cascade impact
  //      so a future "where did CN-2026-NNN go?" question is one
  //      query away. ─────────────────────────────────────────────
  await logAudit({
    actor,
    action: "invoice.delete",
    entityType: "Invoice",
    entityId: invoice.id,
    summary:
      invoice.creditNotes.length > 0
        ? `Deleted ${invoice.number} (cascade removed ${invoice.creditNotes.length} credit note(s))`
        : `Deleted ${invoice.number}`,
    meta: {
      number: invoice.number,
      orderId: invoice.orderId,
      year: invoice.year,
      destinationCountry: invoice.destinationCountry,
      grandTotal: Number(invoice.grandTotal),
      cascadedCreditNotes: invoice.creditNotes.map((c) => c.number),
    },
  });

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/orders/${invoice.orderId}`);
  return {
    ok: true,
    message: `Deleted ${invoice.number}.`,
  };
}
