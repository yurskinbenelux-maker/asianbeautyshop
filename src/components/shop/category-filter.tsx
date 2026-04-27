// ─────────────────────────────────────────────────────────────────────────
// CategoryFilter — editorial row of category pills on /shop.
//
// Server component — active state comes from the URL, not React state.
// Clicking a category pill navigates to /shop/category/<slug>, which is
// a dedicated landing page (editorial hero + merchandised grid). "All"
// sends visitors back to the omnibus /shop listing. Sort preference is
// preserved across the navigation via ?sort=.
//
// Visual hierarchy (the 2026-04 polish):
//   Premium beauty sites surface ~6 broad categories prominently and
//   tuck the long tail behind a "more" disclosure. Showing all 17 of
//   YU.R's narrow K-beauty sub-categories (CC cream, DD cream, peeling
//   gel, cushion…) in one strip reads as a wall of noise.
//
//   So we split the list:
//     • PRIMARY chips — categories with `count >= MIN_PRIMARY_COUNT`
//       (default 2). Always visible, render in their natural sort order.
//     • SECONDARY chips — singletons. Hidden behind a quiet "more"
//       toggle that's an interactive child of this server component
//       via a client island.
//
// Why full navigations (not the old same-page ?category= refinement):
// each category now has its own canonical URL so it ranks on its own
// and Sofia can merchandise a hero per category. Because we're leaving
// the current page, scroll-to-top is desirable (the feedback rule about
// preserving scroll only applies to *refinements* within the same page).
// ─────────────────────────────────────────────────────────────────────────

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { CategoryDisclosure } from "./category-disclosure";

export type CategoryOption = {
  slug: string;
  name: string;
  count: number;
};

/**
 * Threshold for what counts as a "primary" category. Categories with
 * fewer SKUs than this collapse into the "more" disclosure. 2 is a
 * comfortable default — surfaces categories Sofia has actually
 * stocked, hides singletons that read as noise.
 */
const MIN_PRIMARY_COUNT = 2;

/**
 * Hard cap on primary chips. Even if 12 categories pass MIN_PRIMARY_COUNT
 * we still want a single row at desktop widths — so the rest spill into
 * the disclosure. Active categories are always promoted into primary
 * regardless of cap so a deep-linked URL never hides the user's selection.
 */
const PRIMARY_CHIP_LIMIT = 8;

export async function CategoryFilter({
  categories,
  activeSlug,
  sort,
}: {
  categories: CategoryOption[];
  activeSlug?: string;
  sort?: string;
}) {
  const t = await getTranslations("shop");

  const buildHref = (slug?: string) => {
    const qs = new URLSearchParams();
    if (sort && sort !== "newest") qs.set("sort", sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return slug ? `/shop/category/${slug}${suffix}` : `/shop${suffix}`;
  };

  // Split categories into primary (always visible) + secondary (in
  // disclosure). Active category is force-promoted so a deep-linked
  // narrow category isn't hidden behind "more".
  const primary: CategoryOption[] = [];
  const secondary: CategoryOption[] = [];
  for (const c of categories) {
    const isActive = c.slug === activeSlug;
    const promotes =
      isActive ||
      (c.count >= MIN_PRIMARY_COUNT && primary.length < PRIMARY_CHIP_LIMIT);
    if (promotes) primary.push(c);
    else secondary.push(c);
  }

  return (
    <nav
      aria-label={t("categories_label")}
      className="flex flex-wrap items-center gap-x-6 gap-y-2"
    >
      <Pill href={buildHref(undefined)} active={!activeSlug}>
        {t("all")}
      </Pill>
      {primary.map((c) => (
        <Pill
          key={c.slug}
          href={buildHref(c.slug)}
          active={activeSlug === c.slug}
        >
          {c.name}
        </Pill>
      ))}
      {secondary.length > 0 && (
        <CategoryDisclosure
          options={secondary.map((c) => ({
            slug: c.slug,
            name: c.name,
            href: buildHref(c.slug),
            active: activeSlug === c.slug,
          }))}
          label={t("more")}
        />
      )}
    </nav>
  );
}

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      // next-intl Link handles the locale prefix automatically.
      // We deliberately do NOT set scroll={false} — category navigation is
      // a full page change, so Next.js's default scroll-to-top is correct.
      href={href}
      className={cn(
        // Removed the per-pill count badge in this revision — the count
        // appears in the result counter under the strip ("12 PRODUCTS"),
        // and on a tight strip the trailing numbers fragmented the row.
        "text-[12px] uppercase tracking-label transition-colors",
        active
          ? "text-ink underline decoration-vermilion decoration-[1.5px] underline-offset-8"
          : "text-ink-mid hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
