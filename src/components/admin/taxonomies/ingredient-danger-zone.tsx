// ─────────────────────────────────────────────────────────────────────────
// IngredientDangerZone — unlike brand/category, deleting an ingredient
// *removes* its ProductIngredient links (via onDelete: Cascade). The
// confirmation copy reflects that.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import {
  deleteIngredientAction,
  type ActionState,
} from "@/app/admin/categories/actions";

const INITIAL: ActionState = { ok: false };

export function IngredientDangerZone({
  ingredientId,
  productCount,
}: {
  ingredientId: string;
  productCount: number;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border border-vermilion/30 px-3 py-2 text-[11px] uppercase tracking-label text-vermilion hover:bg-vermilion hover:text-white"
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        Delete ingredient
      </button>
    );
  }
  return (
    <DeleteForm
      ingredientId={ingredientId}
      productCount={productCount}
      onCancel={() => setOpen(false)}
    />
  );
}

function DeleteForm({
  ingredientId,
  productCount,
  onCancel,
}: {
  ingredientId: string;
  productCount: number;
  onCancel: () => void;
}) {
  const [state, action] = useActionState(deleteIngredientAction, INITIAL);

  return (
    <form action={action} className="space-y-3 border border-vermilion/30 bg-vermilion/5 p-4">
      <input type="hidden" name="id" value={ingredientId} />
      <p className="text-[12px] text-ink">
        {productCount > 0 ? (
          <>
            This ingredient is on <strong>{productCount}</strong>{" "}
            product{productCount === 1 ? "" : "s"}. Deleting it will remove it
            from their ingredient lists.
          </>
        ) : (
          <>No products are linked — safe to delete.</>
        )}
      </p>

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
      Delete ingredient
    </button>
  );
}
