// ─────────────────────────────────────────────────────────────────────────
// ShopFilters — faceted filter sidebar for /shop.
//
// URL-driven: every toggle rewrites the query string and lets the server
// re-render the grid. No local mirror of the checkbox state — the URL is
// the source of truth so the back button, sharing, and deep links all
// work without extra effort.
//
// Multi-value params are stored comma-separated:
//     /shop?skinType=dry,sensitive&concern=acne&minPrice=20
//
// Behaviour:
//   · scroll: false on every router.push — filtering is a refinement of
//     the current view, not a navigation (see feedback memory).
//   · Mobile: rendered inside a slide-out drawer opened by the "Filters"
//     button up in the header toolbar. Desktop: inline sidebar.
//   · Long taxon lists (ingredients) are clipped to 8 items by default
//     with a Show more / Show less toggle.
//   · "Clear all" strips every facet param but preserves `category` and
//     `sort` — the editorial pills + sort stay where they were.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShopFilters as ShopFilterData } from "@/lib/queries/products";

/**
 * Keys of multi-select params — kept in one place so we parse/write
 * consistently. `brand` was reinstated when the catalog grew beyond a
 * single house and the brand-About pages began linking back here with a
 * pre-applied multi-brand filter (?brand=yur,yur-pro,yur-me).
 */
const MULTI_KEYS = ["skinType", "concern", "brand", "ingredient"] as const;
type MultiKey = (typeof MULTI_KEYS)[number];

type Props = {
  filters: ShopFilterData;
  /** Open/close state is owned by the parent (header button + drawer). */
  open: boolean;
  onClose: () => void;
};

export function ShopFilters({ filters, open, onClose }: Props) {
  const t = useTranslations("shop");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Parse the current URL into plain JS structures once per render.
  const selected = useMemo(() => {
    const read = (key: MultiKey) =>
      (searchParams.get(key)?.split(",").filter(Boolean) ?? []) as string[];
    return {
      skinType: read("skinType"),
      concern: read("concern"),
      brand: read("brand"),
      ingredient: read("ingredient"),
      minPrice: searchParams.get("minPrice"),
      maxPrice: searchParams.get("maxPrice"),
    };
  }, [searchParams]);

  // ── URL helpers ────────────────────────────────────────────────────────
  // Every mutator runs the URL update inside a transition so the grid can
  // stream in without blocking the checkbox animation.
  const pushParams = (params: URLSearchParams) => {
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const toggleMulti = (key: MultiKey, slug: string) => {
    const next = new URLSearchParams(searchParams.toString());
    const current = new Set(
      (next.get(key)?.split(",").filter(Boolean) ?? []) as string[],
    );
    if (current.has(slug)) current.delete(slug);
    else current.add(slug);

    if (current.size === 0) next.delete(key);
    else next.set(key, Array.from(current).join(","));

    pushParams(next);
  };

  const setPrice = (key: "minPrice" | "maxPrice", value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || Number.isNaN(Number(value))) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    pushParams(next);
  };

  const clearAll = () => {
    const next = new URLSearchParams(searchParams.toString());
    for (const k of MULTI_KEYS) next.delete(k);
    next.delete("minPrice");
    next.delete("maxPrice");
    pushParams(next);
  };

  // Count how many facet params are active — surfaced as a badge on the
  // mobile button + clear-all affordance.
  const activeCount =
    MULTI_KEYS.reduce((n, k) => n + selected[k].length, 0) +
    (selected.minPrice ? 1 : 0) +
    (selected.maxPrice ? 1 : 0);

  return (
    <>
      {/* ── backdrop (all viewports — filters are drawer-only now) ── */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        aria-label={t("filters_label")}
        // Drawer slides in from the right at every viewport. The old
        // desktop-static-sidebar mode was dropped when /shop went to
        // the 4-column grid — losing 16rem of left rail bought us a
        // 4th product column above the fold.
        className={cn(
          "fixed right-0 top-0 z-50 flex h-dvh w-[min(24rem,92vw)] flex-col border-l border-ink/10 bg-rice transition-transform",
          open ? "translate-x-0" : "translate-x-full pointer-events-none",
        )}
      >
        {/* drawer header */}
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-5">
          <div className="eyebrow">{t("filters_label")}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close_filters")}
            className="text-ink-mid transition-colors hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={cn(
            "flex-1 overflow-y-auto px-6 py-6",
            // Subtle dim while a refinement is streaming in — reassures
            // the user the click registered without blocking the UI.
            isPending && "opacity-70 transition-opacity",
          )}
        >
          {/* clear-all link — top of the body, only when there's
              something to clear. */}
          {activeCount > 0 && (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] uppercase tracking-label text-vermilion hover:underline hover:underline-offset-4"
              >
                {t("clear_all")}
              </button>
            </div>
          )}

          {/* ── sections ──────────────────────────────────────────── */}
          <FilterGroup title={t("filter_skin_type")} hidden={filters.skinTypes.length === 0}>
            <CheckboxList
              options={filters.skinTypes}
              selected={selected.skinType}
              onToggle={(slug) => toggleMulti("skinType", slug)}
            />
          </FilterGroup>

          <FilterGroup title={t("filter_concern")} hidden={filters.concerns.length === 0}>
            <CheckboxList
              options={filters.concerns}
              selected={selected.concern}
              onToggle={(slug) => toggleMulti("concern", slug)}
            />
          </FilterGroup>

          {/* Brand multi-select. Reinstated when /brands/[slug]/about
              started linking back here with a multi-brand pre-filter
              (e.g. ?brand=yur,yur-pro,yur-me). Hidden when there's only
              one active brand to keep the drawer quiet for single-brand
              shops. */}
          <FilterGroup
            title={t("filter_brand")}
            hidden={filters.brands.length < 2}
          >
            <CheckboxList
              options={filters.brands}
              selected={selected.brand}
              onToggle={(slug) => toggleMulti("brand", slug)}
              collapseAfter={8}
              moreLabel={t("show_more")}
              lessLabel={t("show_less")}
            />
          </FilterGroup>

          <FilterGroup
            title={t("filter_ingredients")}
            hidden={filters.ingredients.length === 0}
          >
            <CheckboxList
              options={filters.ingredients}
              selected={selected.ingredient}
              onToggle={(slug) => toggleMulti("ingredient", slug)}
              collapseAfter={8}
              moreLabel={t("show_more")}
              lessLabel={t("show_less")}
            />
          </FilterGroup>

          {/* price — two plain number inputs, debounced on blur */}
          <FilterGroup title={t("filter_price")}>
            <div className="flex items-center gap-3">
              <PriceInput
                label={t("price_min")}
                placeholder={String(filters.priceMinEur)}
                value={selected.minPrice ?? ""}
                onCommit={(v) => setPrice("minPrice", v)}
              />
              <span aria-hidden className="text-ink-mid">
                —
              </span>
              <PriceInput
                label={t("price_max")}
                placeholder={String(filters.priceMaxEur)}
                value={selected.maxPrice ?? ""}
                onCommit={(v) => setPrice("maxPrice", v)}
              />
            </div>
          </FilterGroup>

          {/* footer apply — closes the drawer; URL filters are
              already live, so this is really "I'm done picking". */}
          <div className="mt-10 flex gap-3">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="flex-1 border border-ink/20 py-3 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
              >
                {t("clear_all")}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-ink py-3 text-[11px] uppercase tracking-label text-rice hover:bg-vermilion"
            >
              {t("apply_filters")}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────

function FilterGroup({
  title,
  hidden,
  children,
}: {
  title: string;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  if (hidden) return null;
  return (
    <section className="mt-8 border-t border-ink/10 pt-6 first:mt-6 md:mt-10 md:first:mt-8">
      <h3 className="text-[11px] uppercase tracking-label text-ink-mid">
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CheckboxList({
  options,
  selected,
  onToggle,
  collapseAfter,
  moreLabel,
  lessLabel,
}: {
  options: Array<{ slug: string; label: string; count: number }>;
  selected: string[];
  onToggle: (slug: string) => void;
  collapseAfter?: number;
  moreLabel?: string;
  lessLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible =
    collapseAfter && !expanded ? options.slice(0, collapseAfter) : options;
  const canCollapse = collapseAfter ? options.length > collapseAfter : false;

  return (
    <>
      <ul className="space-y-2">
        {visible.map((o) => {
          const isSelected = selected.includes(o.slug);
          return (
            <li key={o.slug}>
              <label className="group flex cursor-pointer items-center gap-3 text-[13px] text-ink-mid hover:text-ink">
                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center border transition-colors",
                    isSelected
                      ? "border-ink bg-ink"
                      : "border-ink/30 group-hover:border-ink",
                  )}
                >
                  {isSelected && (
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M3 8l3 3 7-7"
                        className="text-rice"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(o.slug)}
                  className="sr-only"
                />
                <span className="flex-1">{o.label}</span>
                <span className="text-[11px] text-ink-mid/70">{o.count}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {canCollapse && moreLabel && lessLabel && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-[11px] uppercase tracking-label text-ink-mid underline decoration-vermilion underline-offset-4 hover:text-ink"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </>
  );
}

function PriceInput({
  label,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: string;
  onCommit: (v: string) => void;
}) {
  // Controlled input, but we only push to the URL on blur / Enter — typing
  // character-by-character would flood the router with pushes.
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reconcile with external URL changes (clear-all, etc.) — but leave
  // the user's in-flight typing alone when the input is focused.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(value);
    }
  }, [value]);

  return (
    <label className="flex-1">
      <span className="sr-only">{label}</span>
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        min={0}
        placeholder={placeholder}
        value={draft}
        onBlur={(e) => onCommit(e.target.value.trim())}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className="w-full border border-ink/20 bg-transparent px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/50 focus:border-ink focus:outline-none"
      />
    </label>
  );
}
