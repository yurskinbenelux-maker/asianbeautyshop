// ─────────────────────────────────────────────────────────────────────────
// DeleteInvoice — inline expand-on-click delete control for the invoice
// row. Admin clicks "Delete", a small form unfurls demanding the literal
// invoice number to be typed. Submit posts to deleteInvoiceAction.
//
// Mirrors the /admin/customers Danger Zone shape so admins recognise the
// pattern. Vermilion border + small footprint so it doesn't shout from
// every row, but is unmistakably destructive when expanded.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import {
  deleteInvoiceAction,
  type ActionState,
} from "@/app/admin/invoices/actions";

const INITIAL: ActionState = { ok: false };

export function DeleteInvoice({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: string;
  invoiceNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteInvoiceAction, INITIAL);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
        aria-label={`Delete invoice ${invoiceNumber}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Delete
      </button>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-2 border border-vermilion/30 bg-vermilion/5 p-3 text-left"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-vermilion"
          aria-hidden
        />
        <p className="text-[11px] leading-relaxed text-ink">
          Belgian retention is 10 years (Code de droit économique III.86).
          Type{" "}
          <span className="font-mono text-[11px] text-vermilion">
            {invoiceNumber}
          </span>{" "}
          to confirm.
        </p>
      </div>

      <input
        name="confirm"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={invoiceNumber}
        className="border border-ink/15 bg-white px-2 py-1.5 font-mono text-[12px] text-ink focus:border-vermilion focus:outline-none"
      />

      {state.message && !state.ok ? (
        <p className="text-[11px] text-vermilion" role="status" aria-live="polite">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <DeleteButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-1 border border-ink/15 px-3 py-1.5 text-[10px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
        >
          <X className="h-3 w-3" aria-hidden />
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 border border-vermilion bg-vermilion px-3 py-1.5 text-[10px] uppercase tracking-label text-white hover:bg-vermilion/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="h-3 w-3" aria-hidden />
      )}
      Delete invoice
    </button>
  );
}
