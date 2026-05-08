// ─────────────────────────────────────────────────────────────────────────
// BrandAboutSourceForm — picker for the optional aboutFromBrandId field.
// When set, the brand's About page renders the LINKED brand's cover +
// tagline + story instead of its own. Use case: sub-brands of the same
// house (Yu.R / Yu.R Pro / Yu.R Me) share one canonical About so editing
// happens in one place.
//
// UX choices:
//   · Plain <select> rather than a fancy combobox — the picker is
//     low-frequency (most brands won't use this) and an admin already
//     knows the brand list. Native dropdown = zero JS overhead.
//   · "— None (use this brand's own content)" is the first option, set as
//     the default when aboutFromBrandId is null.
//   · Submits via the existing updateBrandAction Server Action — we
//     piggyback on the main form's id field.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  updateBrandAction,
  type ActionState,
} from "@/app/admin/categories/actions";
import { cn } from "@/lib/utils";

const INITIAL: ActionState = { ok: false };

type Option = { id: string; name: string; slug: string };

export function BrandAboutSourceForm({
  brandId,
  brandName,
  brandSlug,
  brandIsActive,
  currentAboutFromBrandId,
  options,
}: {
  brandId: string;
  brandName: string;
  brandSlug: string;
  brandIsActive: boolean;
  currentAboutFromBrandId: string | null;
  /** Every other active brand (excluding self). */
  options: Option[];
}) {
  const router = useRouter();
  const [state, action] = useActionState(updateBrandAction, INITIAL);
  const [, startRefresh] = useTransition();

  return (
    <form
      action={(fd) => {
        action(fd);
        startRefresh(() => router.refresh());
      }}
      className="space-y-3"
    >
      {/* The Server Action expects the same shape as the main brand
          form. We re-supply the existing values here so the action
          doesn't blank them out — only aboutFromBrandId actually
          changes. Hidden inputs keep the wire format identical. */}
      <input type="hidden" name="id" value={brandId} />
      <input type="hidden" name="name" value={brandName} />
      <input type="hidden" name="slug" value={brandSlug} />
      {brandIsActive && (
        <input type="hidden" name="isActive" value="on" />
      )}

      <label
        htmlFor={`about-from-${brandId}`}
        className="block text-[11px] uppercase tracking-label text-ink-mid"
      >
        Source About content from
      </label>
      <select
        id={`about-from-${brandId}`}
        name="aboutFromBrandId"
        defaultValue={currentAboutFromBrandId ?? ""}
        className="w-full max-w-md border border-ink/15 bg-white px-3 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
      >
        <option value="">— None (use this brand&rsquo;s own content)</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>

      <p className="max-w-md text-[12px] leading-relaxed text-ink-mid">
        When set, the About page for this brand displays the chosen
        brand&rsquo;s cover photo, tagline, and story instead of its own.
        Use it for sub-lines that share one parent brand (e.g. <em>Yu.R Pro</em>
        {" "}sources from <em>Yu.R</em>).
      </p>

      <div className="flex items-center gap-3">
        <SaveButton />
        {state.message && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px]",
              state.ok ? "text-sage" : "text-vermilion",
            )}
            role="status"
          >
            {state.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            {state.ok ? "Saved." : state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-ink/90 disabled:opacity-50"
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      Save About source
    </button>
  );
}
