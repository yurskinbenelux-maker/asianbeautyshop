// ─────────────────────────────────────────────────────────────────────────
// OrphanCleanup — toggle-revealed bulk delete form that removes every
// Media row with no product link and no banner link. Requires typing
// DELETE because it's irreversible.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  deleteOrphansAction,
  type ActionState,
} from "@/app/admin/media/actions";

const INITIAL: ActionState = { ok: false };

export function OrphanCleanup({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteOrphansAction, INITIAL);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      setOpen(false);
    }
  }, [state.ok, router]);

  if (count === 0) {
    return (
      <p className="inline-flex items-center gap-1.5 text-[11px] text-sage">
        <Sparkles className="h-3 w-3" />
        No orphan images — library is tidy.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border border-vermilion/30 px-3 py-2 text-[11px] uppercase tracking-label text-vermilion hover:bg-vermilion hover:text-white"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Clean up {count} orphan{count === 1 ? "" : "s"}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="space-y-3 border border-vermilion/30 bg-vermilion/5 p-4"
    >
      <p className="text-[12px] text-ink">
        This permanently deletes <strong>{count}</strong> image
        {count === 1 ? "" : "s"} that aren't linked to any product or banner.
        This can't be undone.
      </p>
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
          Type <span className="font-mono">DELETE</span> to confirm
        </span>
        <input
          name="confirm"
          required
          className="input"
        />
      </label>
      <div className="flex items-center gap-2">
        <SubmitBtn />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="border border-ink/15 px-3 py-2 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
        >
          Cancel
        </button>
        {state.message && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] ${
              state.ok ? "text-sage" : "text-vermilion"
            }`}
          >
            {state.ok ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-vermilion bg-vermilion px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-vermilion/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      Delete orphans
    </button>
  );
}
