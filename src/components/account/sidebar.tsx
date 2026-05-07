// ─────────────────────────────────────────────────────────────────────────
// AccountSidebar — left-rail nav for /[locale]/account/*.
//
// Same editorial palette as the admin sidebar, but simpler: no admin
// branding, labels through next-intl, and a sign-out form at the bottom
// that POSTs to /auth/sign-out with ?redirectTo=/[locale].
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import {
  LayoutDashboard,
  Package,
  MapPin,
  Heart,
  User,
  LogOut,
  RotateCcw,
  Shield,
  Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { YurClubMenuItem } from "./yur-club-menu-item";
import type { DrawerData } from "@/lib/loyalty/drawer-data";

type Section = {
  href: string;
  key:
    | "overview"
    | "orders"
    | "returns"
    | "addresses"
    | "wishlist"
    | "gift_cards"
    | "profile"
    | "privacy";
  icon: React.ComponentType<{ className?: string }>;
};

// Two-part list: the rows BEFORE the Asian Beauty Shop Club entry, then the rows AFTER.
// This is the simplest way to slot the drawer trigger between Gift cards
// and Profile without forking the renderer for one special case.
const SECTIONS_BEFORE_CLUB: Section[] = [
  { href: "/account",           key: "overview",   icon: LayoutDashboard },
  { href: "/account/orders",    key: "orders",     icon: Package },
  { href: "/account/returns",   key: "returns",    icon: RotateCcw },
  { href: "/account/addresses", key: "addresses",  icon: MapPin },
  { href: "/account/wishlist",  key: "wishlist",   icon: Heart },
  { href: "/account/gift-cards", key: "gift_cards", icon: Gift },
];

const SECTIONS_AFTER_CLUB: Section[] = [
  { href: "/account/profile",   key: "profile",   icon: User },
  { href: "/account/privacy",   key: "privacy",   icon: Shield },
];

export function AccountSidebar({
  locale,
  userName,
  userEmail,
  yurClubData,
}: {
  locale: string;
  userName: string;
  userEmail: string;
  /** Prefetched in the layout so the trigger + drawer can render
   *  immediately without a client round-trip. Null when the loyalty
   *  program is disabled or the customer isn't eligible. */
  yurClubData: DrawerData | null;
}) {
  const t = useTranslations("account");
  const pathname = usePathname();

  // Locale-prefixed active check — next-intl's usePathname returns the
  // path *without* the locale prefix, so we can compare directly.
  const isActive = (href: string) => {
    if (href === "/account") return pathname === "/account";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="w-full shrink-0 border-b border-ink/10 md:w-64 md:border-b-0 md:border-r md:bg-white/40">
      {/* user header */}
      <div className="border-b border-ink/10 px-6 py-6 md:py-8">
        <div className="text-[10px] uppercase tracking-label text-ink-mid">
          {t("eyebrow")}
        </div>
        <div className="mt-2 truncate font-display text-[20px] leading-tight text-ink">
          {userName}
        </div>
        <div className="mt-1 truncate text-[12px] text-ink-mid" title={userEmail}>
          {userEmail}
        </div>
      </div>

      {/* nav sections */}
      <nav className="px-3 py-4 md:py-6">
        <ul className="flex gap-1 overflow-x-auto md:block md:space-y-1 md:overflow-visible">
          {SECTIONS_BEFORE_CLUB.map((s) => (
            <SidebarRow key={s.href} section={s} t={t} active={isActive(s.href)} />
          ))}
          {/* Asian Beauty Shop Club drawer trigger — sits between Gift cards and Profile
              per Sofia's brief. Rendered as a button (not a Link) since
              clicking it opens a drawer rather than navigating. */}
          <li className="shrink-0">
            <YurClubMenuItem data={yurClubData} />
          </li>
          {SECTIONS_AFTER_CLUB.map((s) => (
            <SidebarRow key={s.href} section={s} t={t} active={isActive(s.href)} />
          ))}
        </ul>
      </nav>

      {/* sign out */}
      <form
        action="/auth/sign-out"
        method="post"
        className="border-t border-ink/10 px-6 py-4"
      >
        <input type="hidden" name="redirectTo" value={`/${locale}`} />
        <button
          type="submit"
          className="flex items-center gap-3 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
        >
          <LogOut className="h-4 w-4" />
          {t("nav_sign_out")}
        </button>
      </form>
    </aside>
  );
}

function SidebarRow({
  section,
  t,
  active,
}: {
  section: Section;
  t: ReturnType<typeof useTranslations<"account">>;
  active: boolean;
}) {
  const Icon = section.icon;
  return (
    <li className="shrink-0">
      <Link
        href={section.href}
        className={cn(
          "flex items-center gap-3 whitespace-nowrap px-3 py-2 text-[13px] transition-colors",
          active
            ? "bg-ink/5 text-ink"
            : "text-ink-mid hover:bg-ink/5 hover:text-ink",
        )}
      >
        <Icon className="h-4 w-4" />
        <span>{t(`nav_${section.key}`)}</span>
      </Link>
    </li>
  );
}
