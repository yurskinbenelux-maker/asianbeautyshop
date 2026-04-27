// ─────────────────────────────────────────────────────────────────────────
// LineTabs — top-row tab strip for the three YU.R product lines.
//
// Sits above the category chips on /shop. Tabs map directly to the
// productLine column on Product (Yu.R / Yu.R PRO / Yu.R Me) so picking
// "Pro" narrows the grid + filter counts to that sub-line.
//
// Why tabs and not chips:
//   • Lines are a small fixed set (3) with strong brand identity. They
//     deserve a visually weightier treatment than a category like
//     "cleansing foam" — tabs read as "primary navigation".
//   • Customers on premium beauty sites expect a line / collection
//     selector at the top of the listing (Lancôme Absolue/Génifique,
//     Tatcha The Rice/The Silk, etc.).
//
// Refinement mode (single-select):
//   • Click "PRO" → /shop?line=yur-pro
//   • Click "PRO" again or "ALL" → strips ?line=
//   • We deliberately skip multi-select on the strip — the sidebar's
//     Line filter group covers that power-user case. A tab strip with
//     two tabs both visually "active" looks broken to most customers.
//
// Server component — active state is derived from the URL we receive,
// not React state. Other refinement params (skinType, concern, etc.)
// are preserved across line switches.
// ─────────────────────────────────────────────────────────────────────────

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { PRODUCT_LINES } from "@/lib/queries/products";
import type { ShopFilterTaxon } from "@/lib/queries/products";

type Props = {
  /** All filter taxons from getShopFilters. We use them for line counts. */
  lines: ShopFilterTaxon[];
  /** Currently-selected line slug (single — UI only allows one at a time). */
  activeSlug?: string;
  /** Pass-through URL refinement params we want to preserve on line switch. */
  preservedParams: URLSearchParams;
};

export async function LineTabs({ lines, activeSlug, preservedParams }: Props) {
  const t = await getTranslations("shop");

  // Total = sum of every line's count. Used for the "All" tab badge.
  // Falling back to undefined when zero so we don't render "(0)".
  const totalCount = lines.reduce((n, l) => n + l.count, 0);

  // Build the href for a given tab slug. Single-select: passing the slug
  // already active strips the param (acts as a toggle off). Other
  // refinement params (skinType, concern, etc.) are kept.
  const buildHref = (slug?: string) => {
    const next = new URLSearchParams(preservedParams.toString());
    if (!slug || slug === activeSlug) {
      next.delete("line");
    } else {
      next.set("line", slug);
    }
    const qs = next.toString();
    return qs ? `/shop?${qs}` : "/shop";
  };

  // Don't render anything if the catalogue genuinely has no products yet
  // — the strip would just be a lonely "ALL" tab.
  if (lines.length === 0) return null;

  return (
    <nav
      aria-label={t("lines_label")}
      className="flex flex-wrap items-center gap-x-8 gap-y-3"
    >
      <Tab href={buildHref(undefined)} active={!activeSlug} count={totalCount}>
        {t("all")}
      </Tab>
      {/* Iterate PRODUCT_LINES (not the response array) so order is
          deterministic — Yu•R, Pro, Me — even if the query changes.
          Zero-count lines are still rendered (greyed-but-clickable) so
          customers can browse into a line that's still being merchandised
          and admins can see at a glance which line has nothing published. */}
      {PRODUCT_LINES.map((def) => {
        const taxon = lines.find((l) => l.slug === def.slug);
        const count = taxon?.count ?? 0;
        return (
          <Tab
            key={def.slug}
            href={buildHref(def.slug)}
            active={activeSlug === def.slug}
            count={count}
          >
            {def.label}
          </Tab>
        );
      })}
    </nav>
  );
}

function Tab({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      // scroll: false — tab switching is a refinement, not a navigation.
      // The user stays where they were on the page.
      href={href}
      scroll={false}
      className={cn(
        "group inline-flex items-baseline gap-2 pb-1 text-[13px] uppercase tracking-label transition-colors",
        active
          ? "text-ink"
          : "text-ink-mid hover:text-ink",
      )}
    >
      <span
        className={cn(
          "border-b-[1.5px] pb-1 transition-colors",
          active
            ? "border-vermilion"
            : "border-transparent group-hover:border-ink/20",
        )}
      >
        {children}
      </span>
      {count > 0 && (
        <span
          className={cn(
            "text-[11px] tabular-nums",
            active ? "text-ink-mid" : "text-ink-mid/70",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
