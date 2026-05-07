// ─────────────────────────────────────────────────────────────────────────
// AiPolishTranslationButton — admin button + diff modal that polishes
// the product translation copy for the active locale.
//
// Flow:
//   1. an admin clicks "Polish with AI" on a locale tab
//   2. Server action calls Groq with name + INCI + current values
//      (and EN source on non-EN tabs)
//   3. Modal opens with FOUR rows (name / shortDescription /
//      description / howToUse). Each row shows current text on the left,
//      polished text on the right, with a per-field "Apply" toggle.
//   4. an admin ticks the rows she wants and clicks "Apply selected"
//   5. The component injects values into the parent form via
//      setNativeInputValue (same trick the DeepL button uses) — an admin
//      then clicks "Save translation" to commit. No DB write here.
//
// Why per-field selection: the AI nails some fields and over-polishes
// others. Letting an admin pick "yes on description, no on name" is the
// difference between "useful tool" and "tool I always have to undo
// after".
//
// HTML preview note: description + howToUse are HTML. The diff renders
// them inside a <pre>-styled box so tags are visible — an admin can spot
// any unexpected markup before applying.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import { Sparkles, X } from "lucide-react";
import { Locale } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  polishProductTranslation,
  type PolishTranslationResult,
} from "@/app/admin/products/actions";
import type { PolishableField, PolishOutput } from "@/lib/ai/polish-text";

const FIELD_LABELS: Record<PolishableField, string> = {
  name: "Name",
  shortDescription: "Short description",
  description: "Long description",
  howToUse: "How to use",
};

// Order they render in the modal — matches the form layout above.
const FIELD_ORDER: PolishableField[] = [
  "name",
  "shortDescription",
  "description",
  "howToUse",
];

type Props = {
  productId: string;
  locale: Locale;
  /** Called when an admin applies — receives the fields she ticked.
   *  Parent (LocalePanel) injects them into the form via
   *  setNativeInputValue. */
  onApply: (values: Partial<Record<PolishableField, string>>) => void;
};

export function AiPolishTranslationButton({
  productId,
  locale,
  onApply,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PolishTranslationResult | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const r = await polishProductTranslation(productId, locale);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setResult(r);
    });
  }

  function close() {
    setResult(null);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-2 border border-vermilion/30 bg-vermilion/5 px-4 py-2 text-[12px] uppercase tracking-label text-vermilion transition-colors",
          pending
            ? "opacity-60"
            : "hover:border-vermilion hover:bg-vermilion hover:text-rice",
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {pending ? "Polishing…" : "Polish with AI"}
      </button>
      {error && (
        <span className="ml-3 text-[12px] text-vermilion">{error}</span>
      )}

      {result?.ok && (
        <DiffModal
          locale={locale}
          polished={result.polished}
          currentValues={result.currentValues}
          onApply={(picked) => {
            onApply(picked);
            close();
          }}
          onClose={close}
        />
      )}
    </>
  );
}

// ──────── DiffModal ─────────────────────────────────────────────────────

type DiffModalProps = {
  locale: Locale;
  polished: PolishOutput["polished"];
  currentValues: Record<PolishableField, string>;
  onApply: (picked: Partial<Record<PolishableField, string>>) => void;
  onClose: () => void;
};

function DiffModal({
  locale,
  polished,
  currentValues,
  onApply,
  onClose,
}: DiffModalProps) {
  // Per-field "should we apply this row?" toggle. Defaults to ON for
  // every row that the AI actually changed; OFF for unchanged rows
  // (no point applying a no-op).
  const [picked, setPicked] = useState<Record<PolishableField, boolean>>(
    () => ({
      name: polished.name !== currentValues.name && polished.name.trim() !== "",
      shortDescription:
        polished.shortDescription !== currentValues.shortDescription &&
        polished.shortDescription.trim() !== "",
      description:
        polished.description !== currentValues.description &&
        polished.description.trim() !== "",
      howToUse:
        polished.howToUse !== currentValues.howToUse &&
        polished.howToUse.trim() !== "",
    }),
  );

  function toggle(field: PolishableField) {
    setPicked((cur) => ({ ...cur, [field]: !cur[field] }));
  }

  function handleApply() {
    const out: Partial<Record<PolishableField, string>> = {};
    for (const f of FIELD_ORDER) {
      if (picked[f]) out[f] = polished[f];
    }
    onApply(out);
  }

  const anyPicked = FIELD_ORDER.some((f) => picked[f]);
  const anyChanged = FIELD_ORDER.some(
    (f) => polished[f] !== currentValues[f],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI polish suggestion"
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-12 w-full max-w-4xl border border-ink/10 bg-rice shadow-[0_24px_64px_-24px_rgba(0,0,0,0.35)]">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-vermilion" />
              <span className="text-[10px] uppercase tracking-label text-ink-mid">
                AI polish · {locale}
              </span>
            </div>
            <h2 className="mt-2 font-display text-[20px] text-ink">
              Apply polished copy?
            </h2>
            <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-mid">
              Tick the rows you want to apply. Values are loaded into the form
              — click <strong>Save translation</strong> below to commit.
              Slug, warnings, and SEO fields are never touched.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 flex h-9 w-9 items-center justify-center text-ink-mid transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Field rows */}
        <div className="px-6 py-4">
          {!anyChanged && (
            <div className="border border-ink/10 bg-white/60 p-4 text-[13px] italic text-ink-mid">
              The AI didn&apos;t suggest any changes — your copy already
              looks polished.
            </div>
          )}
          {FIELD_ORDER.map((field) => {
            const cur = currentValues[field];
            const next = polished[field];
            const changed = cur !== next;
            return (
              <FieldDiffRow
                key={field}
                label={FIELD_LABELS[field]}
                current={cur}
                polished={next}
                changed={changed}
                isHtml={field === "description" || field === "howToUse"}
                checked={picked[field]}
                onToggle={() => toggle(field)}
              />
            );
          })}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-3 border-t border-ink/10 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!anyPicked}
            className={cn(
              "inline-flex items-center gap-2 bg-ink px-5 py-2.5 text-[12px] uppercase tracking-label text-rice transition-colors",
              anyPicked ? "hover:bg-ink-soft" : "opacity-50",
            )}
          >
            Apply selected
          </button>
        </footer>
      </div>
    </div>
  );
}

// ──────── FieldDiffRow ──────────────────────────────────────────────────

function FieldDiffRow({
  label,
  current,
  polished,
  changed,
  isHtml,
  checked,
  onToggle,
}: {
  label: string;
  current: string;
  polished: string;
  changed: boolean;
  isHtml: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-ink/5 py-4 last:border-b-0">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            disabled={!changed}
            className="h-3.5 w-3.5 accent-vermilion disabled:opacity-30"
            aria-label={`Apply ${label}`}
          />
          <span className="text-[11px] uppercase tracking-label text-ink-mid">
            {label}
          </span>
        </div>
        {!changed && (
          <span className="text-[10px] uppercase tracking-label text-ink-mid/60">
            no change
          </span>
        )}
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        <DiffSide label="Current" value={current} tone="muted" isHtml={isHtml} />
        <DiffSide
          label="Polished"
          value={polished}
          tone="active"
          isHtml={isHtml}
        />
      </div>
    </div>
  );
}

function DiffSide({
  label,
  value,
  tone,
  isHtml,
}: {
  label: string;
  value: string;
  tone: "muted" | "active";
  isHtml: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          "mb-1.5 text-[10px] uppercase tracking-label",
          tone === "active" ? "text-vermilion" : "text-ink-mid/70",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "max-h-[280px] overflow-y-auto whitespace-pre-wrap break-words border p-3 text-[12px] leading-relaxed",
          tone === "active"
            ? "border-vermilion/30 bg-vermilion/5 text-ink"
            : "border-ink/15 bg-white/60 text-ink-mid",
          isHtml && "font-mono",
        )}
      >
        {value.trim() === "" ? (
          <span className="italic text-ink-mid/60">(empty)</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}
