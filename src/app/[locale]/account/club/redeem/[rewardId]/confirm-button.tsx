"use client";

// ─────────────────────────────────────────────────────────────────────────
// ConfirmRedeemButton — the only client island on the confirmation page.
// Wraps the redeemRewardAction in useActionState so we can show a
// "Confirming…" state and an error inline without navigating.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState } from "react";
import {
  redeemRewardAction,
  type RedeemActionState,
} from "../actions";

async function submit(
  _prev: RedeemActionState | null,
  formData: FormData,
): Promise<RedeemActionState> {
  // Server action redirects on success — the action itself never returns
  // here in the happy path. Any value we get back is therefore an error.
  return redeemRewardAction(_prev, formData);
}

export function ConfirmRedeemButton({
  locale,
  rewardId,
  disabled,
}: {
  locale: string;
  rewardId: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<
    RedeemActionState | null,
    FormData
  >(submit, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="rewardId" value={rewardId} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="inline-flex w-full items-center justify-center gap-3 border border-ink bg-ink px-6 py-4 text-[12px] uppercase tracking-label text-rice transition-colors hover:border-vermilion hover:bg-vermilion disabled:opacity-60"
      >
        {pending ? "Confirming…" : "Confirm redemption"}
      </button>
      {state && !state.ok && state.message ? (
        <p className="text-center text-[13px] text-vermilion">{state.message}</p>
      ) : null}
    </form>
  );
}
