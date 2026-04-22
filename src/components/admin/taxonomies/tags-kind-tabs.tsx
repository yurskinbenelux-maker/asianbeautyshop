// ─────────────────────────────────────────────────────────────────────────
// TagsKindTabs — sub-sub-nav for /admin/categories/tags that swaps which
// simple taxonomy kind is being edited. Uses ?kind= so the server page
// can fetch the right rows without duplicating routes.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SimpleTaxonomyKind } from "@/lib/queries/admin-taxonomies";

const KINDS: { value: SimpleTaxonomyKind; label: string; blurb: string }[] = [
  {
    value: "concern",
    label: "Concerns",
    blurb: "What a product targets — dullness, dehydration, pigmentation…",
  },
  {
    value: "skin-type",
    label: "Skin types",
    blurb: "Dry, oily, combination, sensitive, mature — used in the filter.",
  },
  {
    value: "benefit",
    label: "Benefits",
    blurb: "Positive outcomes — glowing, hydrating, calming — shown as chips.",
  },
];

export function TagsKindTabs({ current }: { current: SimpleTaxonomyKind }) {
  return (
    <div>
      <nav aria-label="Tag kind" className="flex items-center gap-1 border-b border-ink/10">
        {KINDS.map((k) => (
          <Link
            key={k.value}
            href={`/admin/categories/tags?kind=${k.value}`}
            aria-current={current === k.value ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-[11px] uppercase tracking-label transition-colors",
              current === k.value
                ? "border-ink text-ink"
                : "border-transparent text-ink-mid hover:text-ink",
            )}
          >
            {k.label}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-[12px] text-ink-mid">
        {KINDS.find((k) => k.value === current)?.blurb}
      </p>
    </div>
  );
}

// Keeps query params in sync client-side — used if we later add a search
// field that filters tags in the current tab.
export function useCurrentKind(): SimpleTaxonomyKind {
  const sp = useSearchParams();
  const raw = sp.get("kind");
  if (raw === "skin-type" || raw === "benefit") return raw;
  return "concern";
}
