// ─────────────────────────────────────────────────────────────────────────
// MediaFilters — search box + scope chips. Uses router.replace with
// scroll:false so clicking a chip doesn't jump back to the top.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaScope } from "@/lib/queries/admin-media";

const CHIPS: { value: MediaScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "linked", label: "Linked to products" },
  { value: "orphan", label: "Orphans" },
];

export function MediaFilters({
  scope,
  q,
  counts,
}: {
  scope: MediaScope;
  q: string;
  counts: { all: number; linked: number; orphan: number };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [draft, setDraft] = useState(q);
  const [, start] = useTransition();

  useEffect(() => {
    // Keep the input synced when the URL changes from outside (e.g. Back).
    setDraft(q);
  }, [q]);

  function buildHref(next: Partial<{ scope: MediaScope; q: string }>) {
    const params = new URLSearchParams(sp.toString());
    if (next.scope) {
      params.set("scope", next.scope);
    }
    if (next.q !== undefined) {
      if (next.q.length > 0) params.set("q", next.q);
      else params.delete("q");
    }
    params.delete("page"); // reset pagination on any filter change
    const s = params.toString();
    return `/admin/media${s ? `?${s}` : ""}`;
  }

  function go(href: string) {
    start(() => router.replace(href, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(buildHref({ q: draft }));
        }}
        className="relative flex-1 min-w-[220px]"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mid" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search by product name or alt text…"
          className="input pl-8"
        />
      </form>

      <div className="flex items-center gap-1">
        {CHIPS.map((chip) => {
          const on = chip.value === scope;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => go(buildHref({ scope: chip.value }))}
              className={cn(
                "inline-flex items-center gap-1.5 border px-3 py-1.5 text-[11px] uppercase tracking-label",
                on
                  ? "border-ink bg-ink text-white"
                  : "border-ink/15 bg-white text-ink-mid hover:border-ink hover:text-ink",
              )}
            >
              {chip.label}
              <span
                className={cn(
                  "inline-block text-[10px]",
                  on ? "text-white/70" : "text-ink-mid/70",
                )}
              >
                {counts[chip.value]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
