// ─────────────────────────────────────────────────────────────────────────
// Small retry button on the admin order detail page. Visible only when
// the order is PAID but has no sendcloudParcelId yet — that's the
// "auto-sync failed, please retry" state.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  retrySendcloudSyncAction,
  type RetrySendcloudState,
} from "@/app/admin/orders/actions";

const INITIAL: RetrySendcloudState = { ok: false };

export function SendcloudRetryButton({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(retrySendcloudSyncAction, INITIAL);

  return (
    <form action={action} className="mt-2 flex flex-col gap-1.5">
      <input type="hidden" name="orderId" value={orderId} />
      <SubmitButton />
      {state.message && (
        <p
          className={cn(
            "text-[11px]",
            state.ok ? "text-sage" : "text-vermilion",
          )}
        >
          {state.message}
        </p>
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
      className="inline-flex items-center gap-1.5 self-start border border-ink/20 bg-white/70 px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <RotateCw className="h-3 w-3" />
      )}
      {pending ? "Syncing…" : "Retry Sendcloud sync"}
    </button>
  );
}
