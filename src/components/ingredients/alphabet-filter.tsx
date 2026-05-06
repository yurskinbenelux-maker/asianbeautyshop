"use client";

// ─────────────────────────────────────────────────────────────────────────
// IngredientsAlphabetView — full A-Z filter + filtered listing.
//
// The /ingredients page can grow to 100+ entries in 4 locales. On mobile
// that's a long scroll even with the page broken into letter sections.
// This component lifts the listing into a filter:
//
//   ┌─────────────────────────────────────────────────────────────┐
//   │ ALL · A B C D E F G H I J K L M N O P Q R S T U V W X Y Z   │
//   └─────────────────────────────────────────────────────────────┘
//
// Tapping a letter restricts both the Key Actives lane AND the A-Z
// listing to ingredients starting with that letter. ALL restores the
// full view. Letters with zero ingredients are dimmed + disabled so
// shoppers can see what's available at a glance.
//
// Filter state is purely client-side (useState) for snappiness; the
// alphabet bar renders sticky on mobile so it stays reachable while
// scrolling through results.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Cyrillic alphabet — added below A-Z for RU locales so Russian
// ingredient names can be filtered too (when an ingredient's
// displayName starts with a Cyrillic letter). Empty buckets are
// auto-hidden, so non-RU locales just won't see this row.
const CYRILLIC = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ".split("");

type IngredientLite = {
  slug: string;
  displayName: string;
  inciName: string;
  shortDescription: string | null;
  isKeyAsset: boolean;
  productCount: number;
};

type Labels = {
  allFilter: string;
  filterAriaLabel: string;
  keyHeading: string;
  allHeading: string;
  productCount: (count: number) => string;
  productCountShort: (count: number) => string;
  emptyForLetter: string;
};

export function IngredientsAlphabetView({
  keyActives,
  others,
  labels,
}: {
  keyActives: IngredientLite[];
  others: IngredientLite[];
  labels: Labels;
}) {
  const [activeLetter, setActiveLetter] = useState<string>("ALL");

  // Pre-compute which letters actually have ingredients (across BOTH
  // lanes) so we can disable empty buckets in the filter bar.
  const presentLetters = useMemo(() => {
    const set = new Set<string>();
    for (const ing of [...keyActives, ...others]) {
      const first = (ing.displayName[0] ?? "").toUpperCase();
      if (first) set.add(first);
    }
    return set;
  }, [keyActives, others]);

  // Only show the Cyrillic row if the catalogue actually has at least
  // one Cyrillic-named ingredient. Keeps the bar tidy for EN/NL/FR.
  const hasCyrillic = useMemo(
    () => CYRILLIC.some((L) => presentLetters.has(L)),
    [presentLetters],
  );

  // Apply the active letter filter to a slice. Pure function — easier
  // to reason about than mutating in place.
  const filterByLetter = (list: IngredientLite[]) => {
    if (activeLetter === "ALL") return list;
    return list.filter(
      (ing) =>
        (ing.displayName[0] ?? "").toUpperCase() === activeLetter,
    );
  };

  const visibleKeyActives = filterByLetter(keyActives);
  const visibleOthers = filterByLetter(others);

  const grouped = useMemo(() => groupByInitial(visibleOthers), [visibleOthers]);
  const letters = Array.from(grouped.keys()).sort();

  return (
    <>
      {/* ── Alphabet filter bar ─────────────────────────────────────
          Sticky on mobile so the visitor can re-pick a letter without
          scrolling all the way back to the top. The `top` offset
          accounts for the existing sticky <header> (~64px on mobile,
          ~80px on desktop). On desktop we drop sticky — the page
          isn't long enough to justify it once filtering is in. */}
      <div
        className="sticky top-16 z-30 -mx-4 mb-10 border-y border-ink/10 bg-rice/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-none md:border-0 md:border-b md:px-0 md:py-4"
        role="toolbar"
        aria-label={labels.filterAriaLabel}
      >
        {/* Latin row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill
            label={labels.allFilter}
            isActive={activeLetter === "ALL"}
            onClick={() => setActiveLetter("ALL")}
            emphasized
          />
          {ALPHABET.map((L) => {
            const present = presentLetters.has(L);
            return (
              <FilterPill
                key={L}
                label={L}
                isActive={activeLetter === L}
                disabled={!present}
                onClick={() => setActiveLetter(L)}
              />
            );
          })}
        </div>
        {/* Cyrillic row — only renders when at least one Cyrillic
            ingredient exists. Mostly relevant for the RU locale. */}
        {hasCyrillic && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {CYRILLIC.map((L) => {
              const present = presentLetters.has(L);
              return (
                <FilterPill
                  key={L}
                  label={L}
                  isActive={activeLetter === L}
                  disabled={!present}
                  onClick={() => setActiveLetter(L)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── Empty state for active letter ────────────────────────── */}
      {activeLetter !== "ALL" &&
        visibleKeyActives.length === 0 &&
        visibleOthers.length === 0 && (
          <p className="text-center text-[14px] text-ink-mid">
            {labels.emptyForLetter}
          </p>
        )}

      {/* ── Key actives lane ───────────────────────────────────── */}
      {visibleKeyActives.length > 0 && (
        <section className="mb-20" aria-labelledby="key-actives-heading">
          <div className="mb-8 flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-vermilion" aria-hidden />
            <h2
              id="key-actives-heading"
              className="text-[11px] uppercase tracking-label text-ink-mid"
            >
              {labels.keyHeading}
            </h2>
          </div>
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {visibleKeyActives.map((ing) => (
              <li key={ing.slug}>
                <KeyActiveCard
                  ing={ing}
                  productsLabel={labels.productCount(ing.productCount)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── A-Z listing (filtered) ─────────────────────────────── */}
      {visibleOthers.length > 0 && (
        <section aria-labelledby="az-heading">
          <div className="mb-8 flex items-center justify-between gap-4">
            <h2
              id="az-heading"
              className="text-[11px] uppercase tracking-label text-ink-mid"
            >
              {labels.allHeading}
            </h2>
          </div>
          <div className="space-y-12">
            {letters.map((L) => (
              <section key={L} id={`letter-${L}`} className="scroll-mt-24">
                <div className="mb-5 flex items-baseline gap-4 border-b border-ink/10 pb-3">
                  <div className="font-display text-[32px] leading-none text-ink">
                    {L}
                  </div>
                  <div className="text-[11px] uppercase tracking-label text-ink-mid">
                    {(grouped.get(L) ?? []).length}
                  </div>
                </div>
                <ul className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
                  {(grouped.get(L) ?? []).map((ing) => (
                    <li key={ing.slug}>
                      <Link
                        href={`/ingredients/${ing.slug}`}
                        className="flex items-baseline justify-between gap-6 border-b border-ink/5 py-2 transition-colors hover:text-vermilion"
                      >
                        <span className="font-display text-[16px] text-ink group-hover:text-vermilion">
                          {ing.displayName}
                        </span>
                        <span className="shrink-0 text-[11px] uppercase tracking-label text-ink-mid">
                          {labels.productCountShort(ing.productCount)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FilterPill — single letter / ALL button. Three visual states:
//   · idle      — ink-mid text, no border
//   · active    — vermilion bg, rice text (+ emphasized=true gets darker)
//   · disabled  — opacity-30, no hover, not focusable
// ─────────────────────────────────────────────────────────────────────

function FilterPill({
  label,
  isActive,
  disabled = false,
  emphasized = false,
  onClick,
}: {
  label: string;
  isActive: boolean;
  disabled?: boolean;
  /** ALL pill: slightly stronger styling so it stands out as the reset. */
  emphasized?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={isActive}
      className={cn(
        "inline-flex h-8 items-center justify-center px-2.5 text-[11px] uppercase tracking-label transition-colors",
        emphasized && "min-w-[44px]",
        !emphasized && "min-w-[28px]",
        isActive
          ? "bg-ink text-rice"
          : disabled
            ? "cursor-not-allowed text-ink-mid/30"
            : "text-ink-mid hover:bg-ink/5 hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// KeyActiveCard — duplicated from the page so the client component is
// self-contained. Same visual as before.
// ─────────────────────────────────────────────────────────────────────

function KeyActiveCard({
  ing,
  productsLabel,
}: {
  ing: IngredientLite;
  productsLabel: string;
}) {
  return (
    <Link
      href={`/ingredients/${ing.slug}`}
      className="group block h-full border border-ink/10 bg-white/60 p-6 transition-colors hover:border-vermilion/40 hover:bg-vermilion/5"
    >
      <div className="font-display text-[22px] leading-tight text-ink">
        {ing.displayName}
      </div>
      {ing.inciName !== ing.displayName && (
        <div className="mt-1 text-[11px] uppercase tracking-label text-ink-mid">
          {ing.inciName}
        </div>
      )}
      {ing.shortDescription && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-mid">
          {ing.shortDescription}
        </p>
      )}
      <div className="mt-6 flex items-center justify-between text-[11px] uppercase tracking-label text-ink-mid">
        <span>{productsLabel}</span>
        <span className="text-ink transition-colors group-hover:text-vermilion">
          →
        </span>
      </div>
    </Link>
  );
}

function groupByInitial<T extends { displayName: string }>(
  items: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const letter = (item.displayName[0] ?? "·").toUpperCase();
    const bucket = map.get(letter) ?? [];
    bucket.push(item);
    map.set(letter, bucket);
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return map;
}
