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
//   Asian Beauty Shop's narrow K-beauty sub-categories (CC cream, DD cream, peeling
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
// and an admin can merchandise a hero per category. Because we're leaving
// the current page, scroll-to-top is desirable (the feedback rule about
// preserving scroll only applies to *refinements* within the same page).
// ─────────────────────────────────────────────────────────────────────────

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export type CategoryOption = {
  slug: string;
  name: string;
  count: number;
};

/**
 * CategoryFilter — flat strip of category chips on /shop.
 *
 * After consolidating to 7 canonical categories (#166), every chip is
 * worth showing — there are no singletons to hide behind a "More"
 * disclosure. We list them all left-to-right in the order their
 * sortOrder column dictates (Cleanser → Toner → Peeling → Essences &
 * Serums → Cream → Mask → SPF — the K-beauty step ritual).
 *
 * If the catalogue grows past what fits on one row, flex-wrap handles
 * the overflow cleanly; we don't reach for a disclosure until that
 * actually starts to look bad.
 */
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

  return (
    <nav
      aria-label={t("categories_label")}
      className="flex flex-wrap items-center gap-x-6 gap-y-2"
    >
      <Pill href={buildHref(undefined)} active={!activeSlug}>
        {t("all")}
      </Pill>
      {categories.map((c) => (
        <Pill
          key={c.slug}
          href={buildHref(c.slug)}
          active={activeSlug === c.slug}
        >
          {c.name}
        </Pill>
      ))}
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
