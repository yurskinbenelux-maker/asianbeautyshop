// ─────────────────────────────────────────────────────────────────────────
// ReorderButtons — two tiny up/down buttons that post to the reorder
// action. Used inside the category tree list.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import {
  reorderCategoryAction,
  type ActionState,
} from "@/app/admin/categories/actions";

const INITIAL: ActionState = { ok: false };

export function ReorderButtons({
  id,
  isFirst,
  isLast,
}: {
  id: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [, action] = useActionState(reorderCategoryAction, INITIAL);
  return (
    <form action={action} className="inline-flex items-center gap-0.5">
      <input type="hidden" name="id" value={id} />
      <DirButton direction="up" disabled={isFirst} />
      <DirButton direction="down" disabled={isLast} />
    </form>
  );
}

function DirButton({
  direction,
  disabled,
}: {
  direction: "up" | "down";
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="direction"
      value={direction}
      disabled={disabled || pending}
      aria-label={direction === "up" ? "Move up" : "Move down"}
      className="inline-flex h-6 w-6 items-center justify-center text-ink-mid hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : direction === "up" ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
    </button>
  );
}
