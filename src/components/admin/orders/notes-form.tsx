// ─────────────────────────────────────────────────────────────────────────
// Admin notes editor — freeform internal notes, never shown to the customer.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  updateAdminNotesAction,
  type ActionState,
} from "@/app/admin/orders/actions";

const INITIAL: ActionState = { ok: false };

export function NotesForm({
  orderId,
  defaultValue,
}: {
  orderId: string;
  defaultValue?: string | null;
}) {
  const [state, action] = useActionState(updateAdminNotesAction, INITIAL);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <textarea
        name="notes"
        defaultValue={defaultValue ?? ""}
        rows={4}
        maxLength={4000}
        placeholder="Private notes visible to admins only."
        className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
      />

      <div className="flex items-center gap-3">
        <SubmitButton>Save note</SubmitButton>
        {state.message && (
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
      className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}
