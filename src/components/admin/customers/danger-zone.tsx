// ─────────────────────────────────────────────────────────────────────────
// Soft-delete ("anonymise") or restore a customer. Hidden behind a
// toggle so Sofia doesn't trip over it while editing profiles.
//
// Delete requires typing "DELETE" to confirm — matches the pattern the
// rest of the app uses for destructive actions.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Trash2,
  RotateCcw,
} from "lucide-react";
import {
  restoreCustomerAction,
  softDeleteCustomerAction,
  type ActionState,
} from "@/app/admin/customers/actions";

const INITIAL: ActionState = { ok: false };

export function DangerZone({
  userId,
  isDeleted,
  isSelf,
}: {
  userId: string;
  isDeleted: boolean;
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (isSelf) {
    return (
      <p className="text-[12px] text-ink-mid">
        You can't delete your own admin account. Sign in as another admin to
        do this.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 border border-vermilion/30 px-3 py-2 text-[11px] uppercase tracking-label text-vermilion hover:bg-vermilion hover:text-white"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          {isDeleted ? "Restore customer" : "Delete customer"}
        </button>
      )}

      {open && !isDeleted && <DeleteForm userId={userId} onCancel={() => setOpen(false)} />}
      {open && isDeleted && <RestoreForm userId={userId} onCancel={() => setOpen(false)} />}
    </div>
  );
}

function DeleteForm({ userId, onCancel }: { userId: string; onCancel: () => void }) {
  const [state, action] = useActionState(softDeleteCustomerAction, INITIAL);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-3 border border-vermilion/30 bg-vermilion/5 p-4">
      <input type="hidden" name="userId" value={userId} />

      <p className="text-[12px] text-ink">
        This anonymises the customer's personal data (name, email, phone,
        addresses, cart, wishlist). Past orders stay linked for
        bookkeeping. Their Supabase auth account will also be removed.
      </p>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
          Type <span className="font-mono">DELETE</span> to confirm
        </span>
        <input
          name="confirm"
          required
          className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
        />
        {err.confirm && err.confirm[0] && (
          <span className="mt-1 block text-[11px] text-vermilion">
            {err.confirm[0]}
          </span>
        )}
      </label>

      <div className="flex items-center gap-3">
        <DeleteButton />
        <button
          type="button"
          onClick={onCancel}
          className="border border-ink/15 px-3 py-2 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
        >
          Cancel
        </button>
        {state.message && !state.ok && (
          <span
            className="inline-flex items-center gap-1.5 text-[12px] text-vermilion"
            role="status"
            aria-live="polite"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function RestoreForm({
  userId,
  onCancel,
}: {
  userId: string;
  onCancel: () => void;
}) {
  const [state, action] = useActionState(restoreCustomerAction, INITIAL);

  return (
    <form action={action} className="space-y-3 border border-ink/15 bg-white p-4">
      <input type="hidden" name="userId" value={userId} />

      <p className="text-[12px] text-ink">
        Restoring re-activates the row under a fresh email. The customer will
        need to sign up again with Supabase to get a login.
      </p>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
          New email
        </span>
        <input
          name="email"
          type="email"
          required
          className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
        />
      </label>

      <div className="flex items-center gap-3">
        <RestoreButton />
        <button
          type="button"
          onClick={onCancel}
          className="border border-ink/15 px-3 py-2 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
        >
          Cancel
        </button>
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

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-vermilion bg-vermilion px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-vermilion/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      Delete customer
    </button>
  );
}

function RestoreButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
      Restore customer
    </button>
  );
}
