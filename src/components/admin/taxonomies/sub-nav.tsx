// ─────────────────────────────────────────────────────────────────────────
// CategoriesSubNav — tab strip across the top of /admin/categories/*.
// Client component only to read pathname; everything below it stays RSC.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/categories", label: "Categories", exact: true },
  { href: "/admin/categories/brands", label: "Brands" },
  { href: "/admin/categories/ingredients", label: "Ingredients" },
  { href: "/admin/categories/tags", label: "Tags" },
];

export function CategoriesSubNav() {
  const pathname = usePathname();

  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  // Pick the right tab:
  //  /admin/categories           -> Categories (exact)
  //  /admin/categories/new       -> Categories (falls through to startsWith)
  //  /admin/categories/[id]      -> Categories
  //  /admin/categories/brands    -> Brands
  // ---
  // The "exact: true" on Categories handles the top-level entry so it
  // doesn't also highlight when you're in /brands or /ingredients.
  // But we still want Categories active on /admin/categories/<id>, so
  // we fall back to startsWith("/admin/categories/") with a skip-list.
  const isCategoryActive =
    pathname === "/admin/categories" ||
    (pathname.startsWith("/admin/categories/") &&
      !pathname.startsWith("/admin/categories/brands") &&
      !pathname.startsWith("/admin/categories/ingredients") &&
      !pathname.startsWith("/admin/categories/tags"));

  return (
    <nav
      aria-label="Taxonomy sections"
      className="sticky top-0 z-20 border-b border-ink/10 bg-rice/90 px-8 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const on =
            tab.href === "/admin/categories"
              ? isCategoryActive
              : active(tab.href, tab.exact);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "inline-block border-b-2 px-3 py-3 text-[12px] uppercase tracking-label transition-colors",
                  on
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-mid hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
