// ─────────────────────────────────────────────────────────────────────────
// CategoryFilter — editorial row of category pills on /shop.
//
// Server component — active state comes from the URL, not React state.
// Clicking a category pill navigates to /shop/category/<slug>, which is
// a dedicated landing page (editorial hero + merchandised grid). "All"
// sends visitors back to the omnibus /shop listing. Sort preference is
// preserved across the navigation via ?sort=.
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

export type CategoryOption = {
  slug: string;
  name: string;
  count: number;
};

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

  // Build the href for a given pill. `undefined` slug → /shop omnibus.
  // Non-default sort is preserved as a querystring on whichever route.
  const buildHref = (slug?: string) => {
    const qs = new URLSearchParams();
    if (sort && sort !== "newest") qs.set("sort", sort);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return slug ? `/shop/category/${slug}${suffix}` : `/shop${suffix}`;
  };

  return (
    <nav
      aria-label="Categories"
      className="flex flex-wrap items-center gap-x-6 gap-y-3"
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
          {c.count > 0 && (
            <span className="ml-2 text-[11px] text-ink-mid">
              {c.count}
            </span>
          )}
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
