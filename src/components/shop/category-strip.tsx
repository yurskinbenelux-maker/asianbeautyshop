// ─────────────────────────────────────────────────────────────────────────
// CategoryStrip — hierarchical category navigation on /shop.
//
// Replaces the old flat 30-chip list (which had categories at every
// level mixed together) with a two-row layout:
//
//   Row 1 — PARENT categories only ("Cleansers", "Toners", …) plus an
//           "All" pill that strips ?category=. Counts respect the
//           active brand filter.
//
//   Row 2 — SUBCATEGORIES of the currently-selected parent. Only
//           renders when a specific parent is active. Counts are the
//           direct product counts on each leaf.
//
// Active state derives from the URL slug:
//   · slug matches a parent → Row 1 highlights that parent, Row 2
//     renders its children unhighlighted.
//   · slug matches a child  → Row 1 highlights the child's PARENT,
//     Row 2 renders the children with the active one highlighted.
//   · no slug → Row 1 "All" highlighted, Row 2 hidden.
//
// Same-page refinement (not navigation away to /shop/category/<slug>):
// clicks toggle the ?category= param so other refinements (brand,
// skinType, ingredients…) compose on top. The /shop/category/<slug>
// editorial landing pages still exist for direct linking + SEO; they
// just aren't the destination of the strip clicks.
// ─────────────────────────────────────────────────────────────────────────

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { ShopCategoryTreeNode } from "@/lib/queries/products";

type Props = {
  /** Top-level categories with their (non-empty) children. */
  tree: ShopCategoryTreeNode[];
  /** Currently-active category slug (parent or child). */
  activeSlug?: string;
  /** Pass-through URL refinement params we want to preserve on switch. */
  preservedParams: URLSearchParams;
};

export async function CategoryStrip({
  tree,
  activeSlug,
  preservedParams,
}: Props) {
  const t = await getTranslations("shop");

  // Resolve active slug → which parent it belongs to. Used to (a)
  // highlight Row 1 and (b) decide which Row 2 children to render.
  let activeParent: ShopCategoryTreeNode | undefined;
  if (activeSlug) {
    activeParent =
      tree.find((p) => p.slug === activeSlug) ??
      tree.find((p) => p.children.some((c) => c.slug === activeSlug));
  }

  const buildHref = (slug?: string) => {
    const next = new URLSearchParams(preservedParams.toString());
    if (!slug) {
      next.delete("category");
    } else {
      next.set("category", slug);
    }
    const qs = next.toString();
    return qs ? `/shop?${qs}` : "/shop";
  };

  if (tree.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Row 1: parent categories ───────────────────────────── */}
      <nav
        aria-label={t("categories_label")}
        className="flex flex-wrap items-center gap-x-6 gap-y-2"
      >
        <Pill
          href={buildHref(undefined)}
          active={!activeSlug}
          weight="parent"
        >
          {t("all")}
        </Pill>
        {tree.map((p) => (
          <Pill
            key={p.slug}
            href={buildHref(p.slug)}
            active={activeParent?.slug === p.slug}
            weight="parent"
          >
            {p.name}
          </Pill>
        ))}
      </nav>

      {/* ── Row 2: subcategories of active parent ──────────────── */}
      {/* Only renders when a parent is selected AND it has children.
          Empty when the active slug is "All" — keeps the strip from
          taking up vertical space when there's nothing to show. */}
      {activeParent && activeParent.children.length > 0 && (
        <nav
          aria-label={t("subcategories_label")}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink/5 pt-4"
        >
          {activeParent.children.map((c) => (
            <Pill
              key={c.slug}
              href={buildHref(c.slug)}
              active={activeSlug === c.slug}
              weight="child"
            >
              {c.name}
            </Pill>
          ))}
        </nav>
      )}
    </div>
  );
}

function Pill({
  href,
  active,
  weight,
  children,
}: {
  href: string;
  active: boolean;
  weight: "parent" | "child";
  children: React.ReactNode;
}) {
  return (
    <Link
      // Same-page refinement — preserve scroll so the user stays on
      // the grid they're browsing.
      href={href}
      scroll={false}
      className={cn(
        "transition-colors",
        weight === "parent"
          ? "text-[12px] uppercase tracking-label"
          : "text-[11.5px]",
        active
          ? "text-ink underline decoration-vermilion decoration-[1.5px] underline-offset-8"
          : "text-ink-mid hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
