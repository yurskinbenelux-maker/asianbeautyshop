// ─────────────────────────────────────────────────────────────────────────
// AdminSidebar — left rail for the admin panel (desktop only, md+).
//
// Client component because we highlight the active section from
// usePathname(). The mobile counterpart lives in
// `./mobile-nav.tsx` — both read the same sections list from
// `./sidebar-config.ts` so the nav stays in sync across surfaces.
//
// IMPORTANT: this component is rendered with `hidden md:flex` from the
// admin layout, so it disappears below the md breakpoint (768px). On
// mobile the AdminMobileNav (hamburger + drawer) takes over.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasCapability, type AdminRole } from "@/lib/auth-roles-shared";
import { Logo } from "@/components/brand/logo";
import {
  ADMIN_SECTIONS,
  ADMIN_ROLE_LABEL,
  type AdminSidebarBadgeCounts,
} from "./sidebar-config";

// Re-export the badge-counts type so existing imports
// (`@/components/admin/sidebar`) keep working without churn.
export type { AdminSidebarBadgeCounts } from "./sidebar-config";

export function AdminSidebar({
  userEmail,
  role,
  badgeCounts,
}: {
  userEmail: string;
  role: AdminRole;
  /** Server-fetched counts for the red-dot badges on Orders + Returns.
   *  Defaults to all-zero so the sidebar still renders if the layout
   *  hasn't wired the prop yet. */
  badgeCounts?: AdminSidebarBadgeCounts;
}) {
  const pathname = usePathname();
  const visible = ADMIN_SECTIONS.filter((s) => hasCapability(role, s.cap));
  const counts: AdminSidebarBadgeCounts = badgeCounts ?? {
    ordersAwaitingShipment: 0,
    returnsAwaitingRefund: 0,
  };

  // Active when the pathname is exactly the href, OR starts with href + "/"
  // (so /admin/products/123 still highlights the Products link).
  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r border-ink/10 bg-white/40 md:flex md:flex-col">
      {/* masthead — wordmark variant fits the tight 28px slot here; the
          full lockup would crush at this size. + "Admin" chip pushed
          to the right. */}
      <div className="flex h-16 items-center gap-3 border-b border-ink/10 px-6">
        <Logo variant="wordmark" height={28} alt="Asian Beauty Shop" />
        <span className="ml-auto text-[10px] uppercase tracking-label text-ink-mid">
          Admin
        </span>
      </div>

      {/* nav sections */}
      <nav className="flex-1 px-3 py-6">
        <ul className="space-y-1">
          {visible.map((s) => {
            const Icon = s.icon;
            const active = isActive(s.href);
            // Look up the badge count for this section. Only renders
            // when > 0 so the sidebar stays calm when there's no
            // pending work. The number shrinks to "9+" past 9 to keep
            // the dot a fixed circle even when admin's been on
            // vacation for a week.
            const badgeValue = s.badgeKey ? counts[s.badgeKey] : 0;
            const badgeLabel =
              badgeValue > 9 ? "9+" : badgeValue > 0 ? String(badgeValue) : null;
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-[13px] transition-colors",
                    active
                      ? "bg-ink/5 text-ink"
                      : "text-ink-mid hover:bg-ink/5 hover:text-ink",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{s.label}</span>
                  {badgeLabel ? (
                    <span
                      className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-vermilion px-1.5 text-[10px] font-medium leading-none text-white tabular-nums"
                      aria-label={`${badgeValue} pending`}
                    >
                      {badgeLabel}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* view-live-site shortcut */}
        <div className="mt-6 border-t border-ink/10 pt-6">
          <Link
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-3 py-2 text-[12px] text-ink-mid transition-colors hover:text-ink"
          >
            <ExternalLink className="h-4 w-4" />
            <span>View live site</span>
          </Link>
        </div>
      </nav>

      {/* user / sign-out */}
      <div className="border-t border-ink/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-label text-ink-mid">
            Signed in
          </div>
          {/* Role pill — reassuring for editors/fulfilment to see their scope */}
          <span className="rounded-full border border-ink/15 px-2 py-[2px] text-[9px] uppercase tracking-label text-ink-mid">
            {ADMIN_ROLE_LABEL[role]}
          </span>
        </div>
        <div className="mt-1 truncate text-[13px] text-ink" title={userEmail}>
          {userEmail}
        </div>
        <form action="/auth/sign-out" method="post" className="mt-3">
          <button
            type="submit"
            className="text-[11px] uppercase tracking-label text-ink-mid underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
