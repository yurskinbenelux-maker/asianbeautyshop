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
} from "lucide-react";
import { cn } from "@/lib/utils";

type Section = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

// NB: Each section is a route under /admin.  We'll build the pages
// in a later session; the links exist now so the IA stays stable.
const SECTIONS: Section[] = [
  { href: "/admin",            label: "Overview",   icon: LayoutDashboard },
  { href: "/admin/products",   label: "Products",   icon: Package },
  { href: "/admin/categories", label: "Categories", icon: Tag },
  { href: "/admin/orders",     label: "Orders",     icon: ShoppingBag },
  { href: "/admin/customers",  label: "Customers",  icon: Users },
  { href: "/admin/coupons",    label: "Coupons",    icon: BadgePercent },
  { href: "/admin/reviews",      label: "Reviews",      icon: MessageSquare },
  { href: "/admin/contact",      label: "Messages",     icon: Mail },
  { href: "/admin/testimonials", label: "Testimonials", icon: Quote },
  { href: "/admin/banners",      label: "Banners",      icon: LayoutPanelTop },
  { href: "/admin/homepage",     label: "Website copy", icon: PenSquare },
  { href: "/admin/journal",    label: "Journal",    icon: BookOpen },
  { href: "/admin/pages",      label: "Pages",      icon: FileText },
  { href: "/admin/media",      label: "Media",      icon: ImageIcon },
  { href: "/admin/emails",     label: "Emails",     icon: Send },
  { href: "/admin/settings",   label: "Settings",   icon: Settings },
];

export function AdminSidebar({
  userEmail,
}: {
  userEmail: string;
}) {
  const pathname = usePathname();

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
          {SECTIONS.map((s) => {
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
        <div className="text-[11px] uppercase tracking-label text-ink-mid">
          Signed in
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
