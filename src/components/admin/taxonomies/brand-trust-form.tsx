// ─────────────────────────────────────────────────────────────────────────
// BrandTrustForm — edits the brand About page's trust signals:
//   · Certifications grid (CPNP, ECAS, GMP, etc.)
//   · Safety / usage callout (pregnancy notes, sensitivity advice, etc.)
//
// Shape is deliberately textarea-first so admins don't have to learn a
// repeater UI for a low-frequency edit. Certifications: one line per
// row, format `CODE | description`. We tolerate `:` as a separator too
// — both forms parse identically server-side.
//
// Submits via setBrandTrustAction (narrow action) so an empty submit
// can't accidentally clobber translations or other brand fields. Same
// pattern as BrandAboutSourceForm.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  setBrandTrustAction,
  type ActionState,
} from "@/app/admin/categories/actions";
import { cn } from "@/lib/utils";

const INITIAL: ActionState = { ok: false };

export type BrandCertificationInitial = {
  code: string;
  description: string;
};

export function BrandTrustForm({
  brandId,
  initialCertifications,
  initialSafetyNote,
}: {
  brandId: string;
  initialCertifications: BrandCertificationInitial[];
  initialSafetyNote: string | null;
}) {
  const router = useRouter();
  const [state, action] = useActionState(setBrandTrustAction, INITIAL);
  const [, startRefresh] = useTransition();

  // Convert the structured array to the textarea wire format so the
  // editor sees what was saved. Round-trip stays lossless because the
  // server parser accepts the same format it just produced.
  const certificationsText = initialCertifications
    .map((c) =>
      c.description ? `${c.code} | ${c.description}` : c.code,
    )
    .join("\n");

  return (
    <form
      action={(fd) => {
        action(fd);
        startRefresh(() => router.refresh());
      }}
      className="space-y-6"
      // `key` forces the textarea to remount with the freshly saved
      // value after router.refresh(); without this the uncontrolled
      // <textarea> keeps showing whatever the admin typed before save,
      // even when the server rejects or normalises the input.
      key={`${certificationsText.length}:${initialSafetyNote?.length ?? 0}`}
    >
      <input type="hidden" name="id" value={brandId} />

      {/* ── Certifications ──────────────────────────────────────── */}
      <div>
        <label
          htmlFor={`certifications-${brandId}`}
          className="block text-[11px] uppercase tracking-label text-ink-mid"
        >
          Certifications
        </label>
        <textarea
          id={`certifications-${brandId}`}
          name="certifications"
          rows={6}
          defaultValue={certificationsText}
          placeholder={`CPNP | EU Cosmetic Notification\nECAS | Emirates Conformity Assessment Scheme\nGMP | Good Manufacturing Practice`}
          className="mt-2 w-full border border-ink/15 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        />
        <p className="mt-2 max-w-md text-[12px] leading-relaxed text-ink-mid">
          One per line. Format: <code className="font-mono">CODE | description</code>.
          Renders as a 2-column grid below the brand story. Leave blank to hide
          the section entirely.
        </p>
      </div>

      {/* ── Safety note ────────────────────────────────────────── */}
      <div>
        <label
          htmlFor={`safety-${brandId}`}
          className="block text-[11px] uppercase tracking-label text-ink-mid"
        >
          Safety / usage note
        </label>
        <textarea
          id={`safety-${brandId}`}
          name="safetyNote"
          rows={5}
          defaultValue={initialSafetyNote ?? ""}
          placeholder="e.g. During pregnancy and breastfeeding, skin can become more sensitive — we advise consulting a healthcare professional before introducing any new skincare into your routine during this period."
          className="mt-2 w-full border border-ink/15 bg-white px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        />
        <p className="mt-2 max-w-md text-[12px] leading-relaxed text-ink-mid">
          Renders as a soft callout box on the brand About page. Use for
          pregnancy / breastfeeding warnings, allergy notices, or
          patch-test guidance. Leave blank to hide.
        </p>
      </div>

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
      Save trust signals
    </button>
  );
}
