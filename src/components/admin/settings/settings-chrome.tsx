// ─────────────────────────────────────────────────────────────────────────
// Shared UI for the settings forms — header, field label, submit button,
// status banner. Kept small on purpose so each section page stays focused
// on its own fields.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/app/admin/settings/actions";

export function SettingsHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header>
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">{description}</p>
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-[11px] text-ink-mid/80">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-[11px] text-vermilion">{error}</span>
      )}
    </label>
  );
}

export function StatusBanner({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 border px-3 py-2 text-[12px]",
        state.ok
          ? "border-sage/30 bg-sage/5 text-sage"
          : "border-vermilion/30 bg-vermilion/5 text-vermilion",
      )}
      role="status"
      aria-live="polite"
    >
      {state.ok ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
      {state.message}
    </p>
  );
}

export function SaveBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-ink/10 pt-6">
      <SaveButton />
      {children}
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Save className="h-3.5 w-3.5" />
      )}
      Save changes
    </button>
  );
}
