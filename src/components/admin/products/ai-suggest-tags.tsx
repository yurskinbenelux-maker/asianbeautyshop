// ─────────────────────────────────────────────────────────────────────────
// AiSuggestTags — admin button + diff modal that fills Brand + Category
// + Subcategory + Skin Types + Concerns + Benefits in one shot.
//
// Flow:
//   1. an admin clicks "Suggest with AI" on the Organise tab
//   2. Button shows a loading state, server action calls Groq with the
//      product's name + INCI + EN description + the live taxonomy
//   3. Modal opens with a side-by-side diff: current tags on the left,
//      suggested tags on the right, with a confidence pill + the AI's
//      one-sentence reasoning
//   4. an admin clicks Apply (overwrite all six axes) or Cancel
//
// Why a full overwrite instead of merge: the AI is producing a coherent
// classification — picking a parent category implies picking the
// subcategory, picking a brand implies a productLine. Merging across
// runs would leave inconsistent state. an admin can re-run if the first
// suggestion isn't right, or untick individual chips manually after
// applying. Keeps the action's behaviour predictable.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  suggestProductTags,
  applySuggestedTags,
  type SuggestTagsResult,
} from "@/app/admin/products/actions";
import type { SuggestTagsOutput } from "@/lib/ai/suggest-tags";

// ──────── Types ─────────────────────────────────────────────────────────

type Props = {
  productId: string;
  /** Reusable lookup tables so the diff can show LABELS, not slugs.
   *  Brand isn't in the AI suggestion (an admin picks it manually) so
   *  it's not in this lookup either. */
  labels: {
    categories: Record<string, string>;
    skinTypes: Record<string, string>;
    concerns: Record<string, string>;
    benefits: Record<string, string>;
  };
};

// ──────── Component ─────────────────────────────────────────────────────

export function AiSuggestTagsButton({ productId, labels }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuggestTagsResult | null>(null);

  function handleSuggest() {
    setError(null);
    startTransition(async () => {
      const r = await suggestProductTags(productId);
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
        onClick={handleSuggest}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-2 border border-vermilion/30 bg-vermilion/5 px-4 py-2 text-[12px] uppercase tracking-label text-vermilion transition-colors",
          pending
            ? "opacity-60"
            : "hover:border-vermilion hover:bg-vermilion hover:text-rice",
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {pending ? "Thinking…" : "Suggest with AI"}
      </button>
      {error && (
        <span className="ml-3 text-[12px] text-vermilion">{error}</span>
      )}

      {result?.ok && (
        <DiffModal
          productId={productId}
          suggestion={result.suggestion}
          current={result.current}
          labels={labels}
          onClose={close}
        />
      )}
    </>
  );
}

// ──────── DiffModal ─────────────────────────────────────────────────────

type DiffModalProps = {
  productId: string;
  suggestion: SuggestTagsOutput;
  current: {
    categorySlugs: string[];
    skinTypeSlugs: string[];
    concernSlugs: string[];
    benefitSlugs: string[];
  };
  labels: Props["labels"];
  onClose: () => void;
};

function DiffModal({
  productId,
  suggestion,
  current,
  labels,
  onClose,
}: DiffModalProps) {
  const [applying, startApply] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  // Pre-compute the suggested category slug list (parent + sub) so the
  // diff renders consistently with the apply action.
  const suggestedCategorySlugs = [
    suggestion.parentCategorySlug,
    suggestion.subcategorySlug,
  ].filter((s): s is string => Boolean(s));

  function handleApply() {
    setStatus(null);
    startApply(async () => {
      const r = await applySuggestedTags(productId, suggestion);
      setStatus({ ok: r.ok ?? false, message: r.message ?? "" });
      if (r.ok) {
        // Give an admin a beat to read the success message, then refresh
        // the page so the Organise form reflects the new tags.
        setTimeout(() => {
          window.location.reload();
        }, 800);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI tag suggestion"
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8"
      onClick={(e) => {
        // Click on backdrop closes; click inside panel doesn't.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-12 w-full max-w-3xl border border-ink/10 bg-rice shadow-[0_24px_64px_-24px_rgba(0,0,0,0.35)]">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-vermilion" />
              <span className="text-[10px] uppercase tracking-label text-ink-mid">
                AI suggestion
              </span>
              <ConfidencePill confidence={suggestion.confidence} />
            </div>
            <h2 className="mt-2 font-display text-[20px] text-ink">
              Apply these tags?
            </h2>
            {suggestion.reasoning && (
              <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-mid">
                {suggestion.reasoning}
              </p>
            )}
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

        {/* Diff body */}
        <div className="px-6 py-6">
          <div className="grid gap-6 md:grid-cols-2">
            <DiffColumn
              title="Current"
              tone="muted"
              categories={current.categorySlugs.map(
                (s) => labels.categories[s] ?? s,
              )}
              skinTypes={current.skinTypeSlugs.map(
                (s) => labels.skinTypes[s] ?? s,
              )}
              concerns={current.concernSlugs.map(
                (s) => labels.concerns[s] ?? s,
              )}
              benefits={current.benefitSlugs.map(
                (s) => labels.benefits[s] ?? s,
              )}
            />
            <DiffColumn
              title="Suggested"
              tone="active"
              categories={suggestedCategorySlugs.map(
                (s) => labels.categories[s] ?? s,
              )}
              skinTypes={suggestion.skinTypeSlugs.map(
                (s) => labels.skinTypes[s] ?? s,
              )}
              concerns={suggestion.concernSlugs.map(
                (s) => labels.concerns[s] ?? s,
              )}
              benefits={suggestion.benefitSlugs.map(
                (s) => labels.benefits[s] ?? s,
              )}
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 border-t border-ink/10 px-6 py-5">
          <div className="text-[12px] text-ink-mid">
            {status &&
              (status.ok ? (
                <span className="text-gold">{status.message}</span>
              ) : (
                <span className="text-vermilion">{status.message}</span>
              ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className="text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying}
              className={cn(
                "inline-flex items-center gap-2 bg-ink px-5 py-2.5 text-[12px] uppercase tracking-label text-rice transition-colors",
                applying ? "opacity-60" : "hover:bg-ink-soft",
              )}
            >
              {applying ? "Applying…" : "Apply suggestion"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ──────── DiffColumn — one side of the side-by-side ──────────────────────

function DiffColumn({
  title,
  tone,
  categories,
  skinTypes,
  concerns,
  benefits,
}: {
  title: string;
  tone: "muted" | "active";
  categories: string[];
  skinTypes: string[];
  concerns: string[];
  benefits: string[];
}) {
  const chipTone =
    tone === "active"
      ? "border-vermilion/40 bg-vermilion/10 text-vermilion"
      : "border-ink/15 bg-white/60 text-ink-mid";

  return (
    <div>
      <div
        className={cn(
          "mb-4 text-[10px] uppercase tracking-label",
          tone === "active" ? "text-vermilion" : "text-ink-mid/70",
        )}
      >
        {title}
      </div>

      <DiffRow label="Categories">
        <ChipList items={categories} chipClass={chipTone} />
      </DiffRow>
      <DiffRow label="Skin types">
        <ChipList items={skinTypes} chipClass={chipTone} />
      </DiffRow>
      <DiffRow label="Concerns">
        <ChipList items={concerns} chipClass={chipTone} />
      </DiffRow>
      <DiffRow label="Benefits">
        <ChipList items={benefits} chipClass={chipTone} />
      </DiffRow>
    </div>
  );
}

function DiffRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-ink/5 py-3 last:border-b-0">
      <div className="mb-1.5 text-[10px] uppercase tracking-label text-ink-mid/70">
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipList({
  items,
  chipClass,
}: {
  items: string[];
  chipClass: string;
}) {
  if (items.length === 0) {
    return <span className="text-[12px] italic text-ink-mid/60">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((label, i) => (
        <span
          key={`${label}-${i}`}
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px]",
            chipClass,
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

// ──────── Confidence pill ────────────────────────────────────────────────

function ConfidencePill({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  const tones = {
    high: "border-gold/40 bg-gold/10 text-gold",
    medium: "border-ink/20 bg-white/60 text-ink-mid",
    low: "border-vermilion/30 bg-vermilion/10 text-vermilion",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-label",
        tones[confidence],
      )}
    >
      {confidence}
    </span>
  );
}

