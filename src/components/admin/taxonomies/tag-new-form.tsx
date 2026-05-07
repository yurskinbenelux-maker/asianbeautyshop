// ─────────────────────────────────────────────────────────────────────────
// TagNewForm — inline "add a new tag" form at the top of the tags page.
// Single row, Enter-to-submit, English label is the required seed; other
// locales can be filled in later via the row's Edit panel.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import {
  createSimpleTaxonomyAction,
  type ActionState,
} from "@/app/admin/categories/actions";
import type { SimpleTaxonomyKind } from "@/lib/queries/admin-taxonomies";
import { cn } from "@/lib/utils";

const INITIAL: ActionState = { ok: false };

export function TagNewForm({
  kind,
  hasIcon,
  placeholder,
}: {
  kind: SimpleTaxonomyKind;
  hasIcon: boolean;
  placeholder: string;
}) {
  const [state, action] = useActionState(createSimpleTaxonomyAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  // On success, wipe the inputs so an admin can type the next tag.
  if (state.ok && formRef.current) {
    formRef.current.reset();
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="border border-ink/10 bg-white/60 px-4 py-3"
    >
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[180px]">
          <span className="mb-1 block text-[10px] uppercase tracking-label text-ink-mid">
            English label
          </span>
          <input
            name="translations.EN.label"
            required
            placeholder={placeholder}
            className="input"
          />
        </label>
        <label className="w-36">
          <span className="mb-1 block text-[10px] uppercase tracking-label text-ink-mid">
            Slug (optional)
          </span>
          <input
            name="slug"
            placeholder="auto"
            className="input"
          />
        </label>
        {hasIcon && (
          <label className="w-32">
            <span className="mb-1 block text-[10px] uppercase tracking-label text-ink-mid">
              Icon
            </span>
            <input
              name="icon"
              placeholder="Droplet"
              className="input"
            />
          </label>
        )}
        <AddButton />
      </div>
      {state.message && (
        <p
          className={cn(
            "mt-2 inline-flex items-center gap-1.5 text-[11px]",
            state.ok ? "text-sage" : "text-vermilion",
          )}
          role="status"
        >
          {state.ok ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <AlertCircle className="h-3 w-3" />
          )}
          {state.message}
        </p>
      )}
    </form>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Plus className="h-3.5 w-3.5" />
      )}
      Add
    </button>
  );
}
