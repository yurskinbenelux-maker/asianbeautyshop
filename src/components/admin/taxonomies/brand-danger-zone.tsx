// ─────────────────────────────────────────────────────────────────────────
// BrandDangerZone — toggle-revealed delete form, requires typing DELETE.
// Deleting a brand *unlinks* products rather than deleting them.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import {
  deleteBrandAction,
  type ActionState,
} from "@/app/admin/categories/actions";

const INITIAL: ActionState = { ok: false };

export function BrandDangerZone({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border border-vermilion/30 px-3 py-2 text-[11px] uppercase tracking-label text-vermilion hover:bg-vermilion hover:text-white"
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        Delete brand
      </button>
    );
  }
  return <DeleteForm brandId={brandId} onCancel={() => setOpen(false)} />;
}

function DeleteForm({
  brandId,
  onCancel,
}: {
  brandId: string;
  onCancel: () => void;
}) {
  const [state, action] = useActionState(deleteBrandAction, INITIAL);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-3 border border-vermilion/30 bg-vermilion/5 p-4">
      <input type="hidden" name="id" value={brandId} />
      <p className="text-[12px] text-ink">
        This removes the brand from the shop. Products that referenced it are
        kept — they just become brand-less until you reassign them.
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
        {err.confirm?.[0] && (
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
          >
            <AlertCircle className="h-3.5 w-3.5" />
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
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      Delete brand
    </button>
  );
}
