// ─────────────────────────────────────────────────────────────────────────
// RedirectForm — shared form for new + edit.
// useActionState + useFormStatus for progressive enhancement.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AdminRedirectRow } from "@/lib/redirects/db";
import type { ActionState } from "@/app/admin/redirects/actions";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

export function RedirectForm({
  action,
  initial,
}: {
  action: Action;
  initial?: AdminRedirectRow | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {
    ok: false,
  });

  const err = (key: string): string | undefined =>
    state.fieldErrors?.[key]?.[0];

  return (
    <form action={formAction} className="space-y-6">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      {state.message && (
        <div
          className={`border px-4 py-3 text-[13px] ${
            state.ok
              ? "border-sage/30 bg-sage/5 text-sage"
              : "border-vermilion/30 bg-vermilion/5 text-vermilion"
          }`}
        >
          {state.message}
        </div>
      )}

      <Field
        label="From path"
        name="fromPath"
        defaultValue={initial?.fromPath ?? ""}
        placeholder="/en/shop/old-slug"
        error={err("fromPath")}
        hint='The URL visitors will arrive on (locale-prefixed, starts with "/").'
        autoFocus
      />

      <Field
        label="To path"
        name="toPath"
        defaultValue={initial?.toPath ?? ""}
        placeholder="/en/shop/new-slug"
        error={err("toPath")}
        hint="Where to send them instead."
      />

      <div>
        <label className="block text-[12px] uppercase tracking-label text-ink-mid">
          Type
        </label>
        <select
          name="code"
          defaultValue={initial?.code ?? "PERMANENT"}
          className="mt-1 w-full border border-ink/15 bg-white/60 px-3 py-2 text-[13px] focus:border-ink/40 focus:outline-none"
        >
          <option value="PERMANENT">301 — Permanent (transfers SEO rank)</option>
          <option value="TEMPORARY">302 — Temporary</option>
        </select>
      </div>

      <Field
        label="Note (optional)"
        name="note"
        defaultValue={initial?.note ?? ""}
        placeholder="e.g. retired spring campaign"
        error={err("note")}
        hint="Just for your own reference — never shown to visitors."
      />

      <div className="flex items-center justify-between gap-4 border-t border-ink/10 pt-6">
        <p className="text-[12px] text-ink-mid">
          {initial ? "Saving will overwrite the existing rule." : "Creating a new redirect."}
        </p>
        <Submit label={initial ? "Save changes" : "Create redirect"} />
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  error,
  hint,
  autoFocus,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-[12px] uppercase tracking-label text-ink-mid">
        {label}
      </label>
      <input
        name={name}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        className={`mt-1 w-full border bg-white/60 px-3 py-2 font-mono text-[13px] focus:outline-none ${
          error
            ? "border-vermilion/40 focus:border-vermilion"
            : "border-ink/15 focus:border-ink/40"
        }`}
      />
      {hint && !error && (
        <p className="mt-1 text-[11px] text-ink-mid">{hint}</p>
      )}
      {error && <p className="mt-1 text-[11px] text-vermilion">{error}</p>}
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
