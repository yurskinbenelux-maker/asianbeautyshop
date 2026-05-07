// ─────────────────────────────────────────────────────────────────────────
// BrandTabs — top-row tab strip on /shop. Single source of truth for the
// brand filter (replaced the legacy LineTabs which read PRODUCT_LINES
// constants). Reads the active Brand rows from the DB so the strip
// auto-updates when an admin adds AHC / iUNIK / etc. via /admin/brands.
//
// Toggle behaviour (single-select):
//   • Click "PRO" → /shop?brand=yur-pro
//   • Click "PRO" again or "ALL" → strips ?brand=
//
// Why no multi-select on the strip: a customer rarely wants products
// from "AHC AND COSRX" simultaneously — they're either browsing one
// brand or the whole catalogue. Multi-select is implemented elsewhere
// (e.g. URL bookmark with ?brand=foo,bar still works) but not surfaced
// in the strip UI.
//
// Server component — active state is derived from the URL we receive,
// not React state. Other refinement params (category, skinType,
// concern, etc.) are preserved across brand switches.
// ─────────────────────────────────────────────────────────────────────────

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { ShopFilterTaxon } from "@/lib/queries/products";

type Props = {
  /** Active brands with counts (from getShopFilters). */
  brands: ShopFilterTaxon[];
  /** Currently-selected brand slug (single — UI only allows one). */
  activeSlug?: string;
  /** Pass-through URL refinement params we want to preserve on switch. */
  preservedParams: URLSearchParams;
};

// Hardcoded YU.R house-line order so the strip reads YU•R · YU•R Pro ·
// YU•R Me regardless of alphabetical name sort. Brands NOT in this list
// fall through to alphabetical-by-name order. When an admin adds AHC /
// COSRX / etc., they'll show after the YU.R cluster — which is the
// correct hierarchy (house brand first, partner brands after).
const YUR_PRIORITY: Record<string, number> = {
  yur: 0,
  "yur-pro": 1,
  "yur-me": 2,
};

export async function BrandTabs({ brands, activeSlug, preservedParams }: Props) {
  const t = await getTranslations("shop");

  // Total = sum of every brand's count. Used for the "All" tab badge.
  const totalCount = brands.reduce((n, b) => n + b.count, 0);

  // Sort: YU.R cluster first in canonical order, then alphabetical.
  const sorted = [...brands].sort((a, b) => {
    const aPri = YUR_PRIORITY[a.slug] ?? 999;
    const bPri = YUR_PRIORITY[b.slug] ?? 999;
    if (aPri !== bPri) return aPri - bPri;
    return a.label.localeCompare(b.label);
  });

  // Build the href for a tab. Toggle-off when clicking the active tab.
  const buildHref = (slug?: string) => {
    const next = new URLSearchParams(preservedParams.toString());
    if (!slug || slug === activeSlug) {
      next.delete("brand");
    } else {
      next.set("brand", slug);
    }
    // Drop any legacy ?line= so we don't carry both axes around.
    next.delete("line");
    const qs = next.toString();
    return qs ? `/shop?${qs}` : "/shop";
  };

  if (brands.length === 0) return null;

  return (
    <nav
      aria-label={t("brands_label")}
      className="flex flex-wrap items-center gap-x-8 gap-y-3"
    >
      <Tab href={buildHref(undefined)} active={!activeSlug} count={totalCount}>
        {t("all")}
      </Tab>
      {sorted.map((b) => (
        <Tab
          key={b.slug}
          href={buildHref(b.slug)}
          active={activeSlug === b.slug}
          count={b.count}
        >
          {b.label}
        </Tab>
      ))}
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
      href={href}
      scroll={false}
      className={cn(
        "group inline-flex items-baseline gap-2 pb-1 text-[13px] uppercase tracking-label transition-colors",
        active ? "text-ink" : "text-ink-mid hover:text-ink",
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
