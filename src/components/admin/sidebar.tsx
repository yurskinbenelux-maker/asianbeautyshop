// ─────────────────────────────────────────────────────────────────────────
// AdminSidebar — left rail for the admin panel.
//
// Client component only because we highlight the active section from
// usePathname().  Everything else (the user info, sign-out button) is
// straight JSX.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Tag,
  ShoppingBag,
  Users,
  Image as ImageIcon,
  Settings,
  ExternalLink,
  BadgePercent,
  LayoutPanelTop,
  MessageSquare,
  Mail,
  Quote,
  BookOpen,
  FileText,
  PenSquare,
  Send,
  RotateCcw,
  CornerDownRight,
  History,
  Beaker,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  hasCapability,
  type AdminCapability,
  type AdminRole,
} from "@/lib/auth-roles";

type Section = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // Capability required to see this section in the sidebar. The nav is
  // filtered purely for UX — the real access-control happens at the page
  // level via `requireCapability(...)` in the server component.
  cap: AdminCapability;
};

// NB: Each section is a route under /admin. Order matters — roughly mirrors
// the mental model: content first, then operations, then platform.
const SECTIONS: Section[] = [
  { href: "/admin",            label: "Overview",   icon: LayoutDashboard,  cap: "products.view" },
  { href: "/admin/products",    label: "Products",    icon: Package,          cap: "products.view" },
  { href: "/admin/categories",  label: "Categories",  icon: Tag,              cap: "categories.edit" },
  { href: "/admin/ingredients", label: "Ingredients", icon: Beaker,           cap: "ingredients.edit" },
  { href: "/admin/orders",     label: "Orders",     icon: ShoppingBag,      cap: "orders.view" },
  { href: "/admin/returns",    label: "Returns",    icon: RotateCcw,        cap: "returns.view" },
  { href: "/admin/customers",  label: "Customers",  icon: Users,            cap: "customers.view" },
  { href: "/admin/coupons",    label: "Coupons",    icon: BadgePercent,     cap: "coupons.edit" },
  { href: "/admin/reviews",      label: "Reviews",      icon: MessageSquare, cap: "reviews.moderate" },
  { href: "/admin/contact",      label: "Messages",     icon: Mail,          cap: "contact.view" },
  { href: "/admin/testimonials", label: "Testimonials", icon: Quote,         cap: "testimonials.edit" },
  { href: "/admin/banners",      label: "Banners",      icon: LayoutPanelTop, cap: "banners.edit" },
  { href: "/admin/homepage",     label: "Website copy", icon: PenSquare,     cap: "homepage.edit" },
  { href: "/admin/journal",    label: "Journal",    icon: BookOpen,         cap: "journal.edit" },
  { href: "/admin/pages",      label: "Pages",      icon: FileText,         cap: "pages.edit" },
  { href: "/admin/media",      label: "Media",      icon: ImageIcon,        cap: "media.edit" },
  { href: "/admin/emails",     label: "Emails",     icon: Send,             cap: "emails.send" },
  { href: "/admin/redirects",  label: "Redirects",  icon: CornerDownRight,  cap: "redirects.edit" },
  { href: "/admin/audit",      label: "Audit log",  icon: History,          cap: "audit.view" },
  { href: "/admin/settings",   label: "Settings",   icon: Settings,         cap: "settings.view" },
];

const ROLE_LABEL: Record<AdminRole, string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  FULFILMENT: "Fulfilment",
};

export function AdminSidebar({
  userEmail,
  role,
}: {
  userEmail: string;
  role: AdminRole;
}) {
  const pathname = usePathname();
  const visible = SECTIONS.filter((s) => hasCapability(role, s.cap));

  // Active when the pathname is exactly the href, OR starts with href + "/"
  // (so /admin/products/123 still highlights the Products link).
  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r border-ink/10 bg-white/40 md:flex md:flex-col">
      {/* masthead */}
      <div className="flex h-16 items-center gap-3 border-b border-ink/10 px-6">
        <span className="font-display text-[20px] tracking-tight text-ink">
          YU.R
        </span>
        <span className="seal" aria-hidden>
          유
        </span>
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
            {ROLE_LABEL[role]}
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
