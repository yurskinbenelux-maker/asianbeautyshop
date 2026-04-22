// ─────────────────────────────────────────────────────────────────────────
// SettingsSubNav — sticky tab strip across /admin/settings/*.
// Same aesthetic as CategoriesSubNav: ink-underline, uppercase labels.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/settings/store", label: "Store" },
  { href: "/admin/settings/shipping", label: "Shipping" },
  { href: "/admin/settings/tax", label: "Tax" },
  { href: "/admin/settings/seo", label: "SEO" },
  { href: "/admin/settings/ai", label: "AI assistant" },
];

export function SettingsSubNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-0 z-20 border-b border-ink/10 bg-rice/90 px-8 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const on = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
