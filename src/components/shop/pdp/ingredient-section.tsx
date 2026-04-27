// ─────────────────────────────────────────────────────────────────────────
// IngredientSection — the "What's inside" block on the PDP.
//
// Two parts:
//   1. Key ingredients — hero cards (one each) with INCI name, display
//      name, percentage if recorded, and a short "what it does" body.
//   2. Full INCI list — collapsible comma-separated list of everything.
//
// We render nothing if the product has no ingredients recorded.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PdpIngredient } from "@/lib/queries/pdp";

type Labels = {
  eyebrow: string;          // "Ingredients"
  keyTitle: string;         // "Key ingredients"
  fullTitle: string;        // "Full INCI"
  show: string;             // "Show the list"
  hide: string;             // "Hide the list"
  allergenSuffix: string;   // "May contain" or "Allergen"
};

export function IngredientSection({
  ingredients,
  fullInciText,
  labels,
}: {
  ingredients: PdpIngredient[];
  /**
   * The full INCI declaration as a single string, sourced from
   * Product.inciList (the supplier's official packaging text). When
   * provided, this is the source of truth for the "Show the list"
   * accordion — it's the legally-correct, complete statement. We fall
   * back to comma-joining the curated `ingredients` pivot only when no
   * INCI text has been recorded for the product.
   */
  fullInciText?: string | null;
  labels: Labels;
}) {
  const [open, setOpen] = useState(false);

  // Render nothing only if BOTH sources are empty — the section is the
  // PDP's regulatory ingredients block, so even a product with no key
  // ingredients curated should still expose the full INCI when set.
  if (ingredients.length === 0 && !fullInciText) return null;

  const key = ingredients.filter((i) => i.isKey || i.isKeyAsset);
  const fallbackKey = key.length === 0 ? ingredients.slice(0, 3) : key;

  // Full list — INCI string from supplier wins; otherwise compose from
  // the pivot. Returns the rendered string (no JSX) so the markup below
  // stays simple and the count display works for both shapes.
  const fullText = fullInciText?.trim()
    ? fullInciText.trim()
    : ingredients
        .map((i) =>
          i.isKey || i.isKeyAsset ? `*${i.inciName}` : i.inciName,
        )
        .join(", ");
  const fullCount = fullInciText?.trim()
    ? fullInciText.split(",").filter((s) => s.trim().length > 0).length
    : ingredients.length;

  return (
    <section className="container mt-24 max-w-4xl">
      <div className="eyebrow">{labels.eyebrow}</div>
      <h2 className="mt-3 font-display text-[28px] leading-tight text-ink">
        {labels.keyTitle}
      </h2>

      {/* ── key ingredient cards ─────────────────────────────────── */}
      <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
        {fallbackKey.map((ing) => (
          <article
            key={ing.id}
            className="flex flex-col bg-rice p-6 transition-colors hover:bg-rice-dim"
          >
            <div className="flex items-baseline justify-between gap-4">
              <div className="font-kr text-[13px] text-ink-mid">
                {ing.inciName}
              </div>
              {ing.percentage !== null && (
                <div className="font-mono text-[11px] tracking-label text-vermilion">
                  {ing.percentage}%
                </div>
              )}
            </div>
            <h3 className="mt-1 font-display text-[20px] leading-tight text-ink">
              {ing.displayName}
            </h3>
            {ing.description && (
              <div
                className="prose-editorial mt-3 text-[13px] leading-relaxed text-ink-mid"
                dangerouslySetInnerHTML={{ __html: ing.description }}
              />
            )}
            {ing.isAllergen && (
              <div className="mt-auto pt-4 text-[10px] uppercase tracking-label text-vermilion-deep">
                · {labels.allergenSuffix}
              </div>
            )}
          </article>
        ))}
      </div>

      {/* ── full INCI list (collapsible) ─────────────────────────── */}
      <div className="mt-12 border-t border-ink/10 pt-8">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex w-full items-center justify-between gap-4 text-left"
        >
          <div>
            <div className="eyebrow">{labels.fullTitle}</div>
            <div className="mt-1 text-[13px] text-ink-mid">
              {fullCount} {fullCount === 1 ? "ingredient" : "ingredients"}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-ink-mid transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <p className="mt-6 whitespace-pre-line font-mono text-[12px] leading-[1.9] tracking-wide text-ink-mid">
            {fullText}
          </p>
        )}
      </div>
    </section>
  );
}
