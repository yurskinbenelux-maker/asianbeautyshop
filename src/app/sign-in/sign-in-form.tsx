// ─────────────────────────────────────────────────────────────────────────
// SignInForm — the actual input + submit, driven by useActionState so we
// can show success/error states without a full page reload.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendMagicLink, type SignInState } from "./actions";

const INITIAL: SignInState = { ok: false, message: "" };

export function SignInForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(sendMagicLink, INITIAL);

  // Success state — don't re-show the form, reduce anxious clicks.
  if (state?.ok) {
    return (
      <div className="border border-ink/10 bg-white/60 p-6">
        <div className="eyebrow text-vermilion">Link sent</div>
        <p className="mt-3 text-[14px] leading-relaxed text-ink">
          {state.message}
        </p>
        <p className="mt-4 text-[12px] text-ink-mid">
          The link expires in 10 minutes. Close this tab safely.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <label className="block">
        <span className="sr-only">Email</span>
        <input
          type="email"
          name="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="your@email.com"
          className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
        />
      </label>

      {state && !state.ok && state.message && (
        <p role="alert" className="text-[12px] text-vermilion">
          {state.message}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  // useFormStatus must be called from a child of <form>, which is why
  // this is its own component.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 w-full bg-ink text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send sign-in link"}
    </button>
  );
}
