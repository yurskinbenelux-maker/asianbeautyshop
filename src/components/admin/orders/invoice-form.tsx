// ─────────────────────────────────────────────────────────────────────────
// Paste an invoice URL. Later, auto-generated PDFs can write straight
// into the same field via a server job, bypassing this form.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  updateInvoiceUrlAction,
  type ActionState,
} from "@/app/admin/orders/actions";

const INITIAL: ActionState = { ok: false };

export function InvoiceForm({
  orderId,
  defaultValue,
}: {
  orderId: string;
  defaultValue?: string | null;
}) {
  const [state, action] = useActionState(updateInvoiceUrlAction, INITIAL);
  const err = state.fieldErrors?.invoiceUrl;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input
        type="url"
        name="invoiceUrl"
        defaultValue={defaultValue ?? ""}
        placeholder="https://…"
        className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
      />
      {err && err.length > 0 && (
        <p className="text-[11px] text-vermilion">{err[0]}</p>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton>Save invoice URL</SubmitButton>
        {state.message && !err && (
          <span
            className={
              "inline-flex items-center gap-1.5 text-[12px] " +
              (state.ok ? "text-sage" : "text-vermilion")
            }
            role="status"
            aria-live="polite"
          >
            {state.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink/20 px-3 py-2 text-[11px] uppercase tracking-label text-ink hover:border-ink hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}
