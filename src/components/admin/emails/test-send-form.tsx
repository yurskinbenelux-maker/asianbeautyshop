"use client";

// ─────────────────────────────────────────────────────────────────────────
// TestSendForm — the small "send test to my inbox" control that lives
// beside the subject line on the email-preview page.
//
// Client component because useActionState + useFormStatus drive the
// loading spinner and success/error line. The server action itself
// (`sendTestEmailAction`) decides who receives the email — the button
// never asks for or accepts a recipient address, so an admin can't
// accidentally spam a customer from the preview screen.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, Send, AlertCircle } from "lucide-react";
import { Locale } from "@prisma/client";
import {
  sendTestEmailAction,
  type ActionState,
} from "@/app/admin/emails/actions";

const INITIAL: ActionState = { ok: false };

export function TestSendForm({
  templateKey,
  locale,
}: {
  templateKey: string;
  locale: Locale;
}) {
  const [state, formAction] = useActionState(sendTestEmailAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-2 md:items-end">
      {/* keyed by templateKey + locale so the button resets when either changes */}
      <input type="hidden" name="templateKey" value={templateKey} />
      <input type="hidden" name="locale" value={locale} />
      <SubmitButton />
      {state.message && (
        <StatusLine ok={state.ok} message={state.message} />
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Sending…
        </>
      ) : (
        <>
          <Send className="h-3.5 w-3.5" />
          Send test to my inbox
        </>
      )}
    </button>
  );
}

function StatusLine({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div
      role="status"
      className={`inline-flex items-center gap-1.5 text-[11px] ${
        ok ? "text-sage" : "text-vermilion"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden />
      ) : (
        <AlertCircle className="h-3 w-3" aria-hidden />
      )}
      <span>{message}</span>
    </div>
  );
}
