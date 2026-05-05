// ─────────────────────────────────────────────────────────────────────────
// ShopFiltersShell — tiny client wrapper that owns the open/close state
// for the mobile filter drawer and renders:
//   · The mobile "Filters" trigger button (with an active-count badge)
//   · The ShopFilters sidebar/drawer itself
//
// The shell exists so /shop/page.tsx can stay a server component — only
// the interactive bits cross the client boundary.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";
import { ShopFilters } from "./shop-filters";
import type { ShopFilters as ShopFilterData } from "@/lib/queries/products";

const FACET_KEYS = [
  "skinType",
  "concern",
  "brand",
  "ingredient",
  "minPrice",
  "maxPrice",
] as const;

export function ShopFiltersShell({ filters }: { filters: ShopFilterData }) {
  const t = useTranslations("shop");
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();

  // Count of active facet params — used as the little pill on the
  // mobile trigger. Category + sort aren't facets so we skip them.
  const activeCount = FACET_KEYS.reduce((n, key) => {
    const raw = searchParams.get(key);
    if (!raw) return n;
    if (key === "minPrice" || key === "maxPrice") return n + 1;
    return n + raw.split(",").filter(Boolean).length;
  }, 0);

  return (
    <>
      {/* Trigger — visible at every viewport now that filters are
          drawer-only. Sits next to the Sort control in the toolbar
          row above the grid. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
        aria-label={t("open_filters")}
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        <span>{t("filters_label")}</span>
        {activeCount > 0 && (
          <span
            aria-label={`${activeCount} active`}
            className="ml-1 inline-flex h-5 min-w-5 items-center justify-center bg-vermilion px-1.5 text-[10px] text-rice"
          >
            {activeCount}
          </span>
        )}
      </button>

      <ShopFilters
        filters={filters}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
