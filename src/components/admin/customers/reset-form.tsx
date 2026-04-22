// ─────────────────────────────────────────────────────────────────────────
// Send a Supabase password-reset email. One button, one confirmation line.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import {
  sendPasswordResetAction,
  type ActionState,
} from "@/app/admin/customers/actions";

const INITIAL: ActionState = { ok: false };

export function ResetForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(sendPasswordResetAction, INITIAL);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton>
        <KeyRound className="h-3.5 w-3.5" />
        Send reset email
      </SubmitButton>
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
