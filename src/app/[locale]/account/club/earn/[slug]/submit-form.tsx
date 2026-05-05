"use client";

// ─────────────────────────────────────────────────────────────────────────
// SubmitTaskForm — claim a manual-review task.
//
// Wraps the server action in useActionState so the customer sees a
// "Submitting…" state and an inline error message rather than a hard
// reload. Successful submissions redirect server-side to /earn?submitted=
// so this component never renders a "submitted" success state directly.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState } from "react";
import {
  submitTaskClaimAction,
  type SubmitTaskState,
} from "../actions";

async function submit(
  _prev: SubmitTaskState | null,
  formData: FormData,
): Promise<SubmitTaskState> {
  return submitTaskClaimAction(_prev, formData);
}

export function SubmitTaskForm({
  locale,
  slug,
  requiresProofUrl,
  disabled,
}: {
  locale: string;
  slug: string;
  requiresProofUrl: boolean;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<
    SubmitTaskState | null,
    FormData
  >(submit, null);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="slug" value={slug} />

      {requiresProofUrl ? (
        <label className="block">
          <div className="text-[12px] text-ink">Proof URL</div>
          <input
            type="url"
            name="proofUrl"
            required
            placeholder="https://www.instagram.com/stories/your-handle/…"
            className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-ink-mid">
            Paste the link to your post or story so we can verify.
          </p>
        </label>
      ) : null}

      <label className="block">
        <div className="text-[12px] text-ink">A note (optional)</div>
        <textarea
          name="notes"
          rows={3}
          maxLength={500}
          placeholder="Anything we should know — your handle, where you tagged us, etc."
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={disabled || pending}
          className="inline-flex w-full items-center justify-center gap-3 border border-ink bg-ink px-6 py-3 text-[12px] uppercase tracking-label text-rice transition-colors hover:border-vermilion hover:bg-vermilion disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit for review"}
        </button>
        {state && !state.ok && state.message ? (
          <p className="text-center text-[13px] text-vermilion">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
