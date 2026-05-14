// ─────────────────────────────────────────────────────────────────────────
// AdminMobileNav — top bar + slide-in drawer for admin on small screens.
//
// Lives below md (768px) only; the desktop sidebar takes over above. Uses
// the SAME sections list as the sidebar (sidebar-config.ts) so adding a
// new admin route only needs to be done in one place.
//
// UX:
//   · Fixed top bar with the wordmark, an "Admin" chip, and a hamburger
//     button on the right (active section label shown beside it so the
//     admin knows where they are at a glance).
//   · Tapping the hamburger slides a full-height drawer in from the right
//     with the same nav list, sign-out button, role pill, and view-live-
//     site shortcut as the desktop sidebar.
//   · Backdrop dims the page and closes the drawer on tap.
//   · Drawer closes automatically on route change (pathname effect).
//   · Esc key closes the drawer for keyboard users.
//   · Body scroll is locked while the drawer is open so the underlying
//     page doesn't bounce.
//
// Accessibility:
//   · Hamburger button uses `aria-expanded` + `aria-controls` so screen
//     readers know it's a disclosure.
//   · Drawer has `role="dialog"` + `aria-modal="true"` + an `aria-label`.
//   · Focus is moved to the close button when the drawer opens.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasCapability, type AdminRole } from "@/lib/auth-roles-shared";
import { Logo } from "@/components/brand/logo";
import {
  ADMIN_SECTIONS,
  ADMIN_ROLE_LABEL,
  type AdminSidebarBadgeCounts,
} from "./sidebar-config";

export function AdminMobileNav({
  userEmail,
  role,
  badgeCounts,
}: {
  userEmail: string;
  role: AdminRole;
  /** Server-fetched counts for the red-dot badges on Orders + Returns. */
  badgeCounts?: AdminSidebarBadgeCounts;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const visible = ADMIN_SECTIONS.filter((s) => hasCapability(role, s.cap));
  const counts: AdminSidebarBadgeCounts = badgeCounts ?? {
    ordersAwaitingShipment: 0,
    returnsAwaitingRefund: 0,
  };

  // Active = exact match OR href is a prefix segment of the path.
  // /admin/products/123 still highlights "Products".
  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Current section label, shown in the top bar so the admin always
  // knows where they are without opening the drawer.
  const current = visible.find((s) => isActive(s.href));

  // Close the drawer whenever the admin navigates. Without this, tapping
  // a nav link would route but leave the drawer open over the next page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Esc closes the drawer (keyboard users).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while the drawer is open — the drawer scrolls
  // internally, the page underneath shouldn't.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Move focus to the close button when the drawer opens — screen reader
  // and keyboard users land somewhere predictable.
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  return (
    <>
      {/* ── Sticky top bar (mobile only) ──────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink/10 bg-white/85 px-4 backdrop-blur md:hidden">
        <Logo variant="wordmark" height={22} alt="Asian Beauty Shop" />
        <span className="text-[9px] uppercase tracking-label text-ink-mid">
          Admin
        </span>
        {/* Current section label — small, ink-mid, truncates if long. */}
        {current ? (
          <span className="ml-1 truncate text-[12px] text-ink">
            · {current.label}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="admin-mobile-drawer"
          aria-label="Open admin menu"
          className="ml-auto inline-flex h-10 w-10 items-center justify-center text-ink"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* ── Backdrop ──────────────────────────────────────────── */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-ink/40 transition-opacity duration-200 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* ── Drawer ────────────────────────────────────────────── */}
      {/* Slides in from the right. translate-x-full when closed,
          translate-x-0 when open. ease-out duration-300 — same feeling
          as iOS sheet presentations. */}
      <aside
        id="admin-mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[85%] max-w-sm flex-col border-l border-ink/10 bg-rice shadow-xl transition-transform duration-300 ease-out md:hidden",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* drawer header */}
        <div className="flex h-14 items-center gap-3 border-b border-ink/10 px-5">
          <Logo variant="wordmark" height={22} alt="Asian Beauty Shop" />
          <span className="text-[9px] uppercase tracking-label text-ink-mid">
            Admin
          </span>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close admin menu"
            className="ml-auto inline-flex h-10 w-10 items-center justify-center text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* nav list — scrolls when the section list overflows */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {visible.map((s) => {
              const Icon = s.icon;
              const active = isActive(s.href);
              const badgeValue = s.badgeKey ? counts[s.badgeKey] : 0;
              const badgeLabel =
                badgeValue > 9
                  ? "9+"
                  : badgeValue > 0
                    ? String(badgeValue)
                    : null;
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    className={cn(
                      // Bigger tap targets than desktop — 44px is the
                      // iOS HIG minimum and feels right on a phone.
                      "flex items-center gap-3 px-3 py-3 text-[14px] transition-colors",
                      active
                        ? "bg-ink/5 text-ink"
                        : "text-ink-mid hover:bg-ink/5 hover:text-ink",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
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

          {/* view-live-site shortcut — same as desktop */}
          <div className="mt-6 border-t border-ink/10 pt-6">
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-2 text-[13px] text-ink-mid transition-colors hover:text-ink"
            >
              <ExternalLink className="h-4 w-4" />
              <span>View live site</span>
            </Link>
          </div>
        </nav>

        {/* user / sign-out — pinned to bottom */}
        <div className="border-t border-ink/10 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-label text-ink-mid">
              Signed in
            </div>
            <span className="rounded-full border border-ink/15 px-2 py-[2px] text-[9px] uppercase tracking-label text-ink-mid">
              {ADMIN_ROLE_LABEL[role]}
            </span>
          </div>
          <div
            className="mt-1 truncate text-[13px] text-ink"
            title={userEmail}
          >
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
    </>
  );
}
