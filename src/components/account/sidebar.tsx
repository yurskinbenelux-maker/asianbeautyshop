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
} from "lucide-react";
import { cn } from "@/lib/utils";

type Section = {
  href: string;
  key:
    | "overview"
    | "orders"
    | "returns"
    | "addresses"
    | "wishlist"
    | "profile"
    | "privacy";
  icon: React.ComponentType<{ className?: string }>;
};

const SECTIONS: Section[] = [
  { href: "/account",           key: "overview",  icon: LayoutDashboard },
  { href: "/account/orders",    key: "orders",    icon: Package },
  { href: "/account/returns",   key: "returns",   icon: RotateCcw },
  { href: "/account/addresses", key: "addresses", icon: MapPin },
  { href: "/account/wishlist",  key: "wishlist",  icon: Heart },
  { href: "/account/profile",   key: "profile",   icon: User },
  { href: "/account/privacy",   key: "privacy",   icon: Shield },
];

export function AccountSidebar({
  locale,
  userName,
  userEmail,
}: {
  locale: string;
  userName: string;
  userEmail: string;
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
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = isActive(s.href);
            return (
              <li key={s.href} className="shrink-0">
                <Link
                  href={s.href}
                  className={cn(
                    "flex items-center gap-3 whitespace-nowrap px-3 py-2 text-[13px] transition-colors",
                    active
                      ? "bg-ink/5 text-ink"
                      : "text-ink-mid hover:bg-ink/5 hover:text-ink",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(`nav_${s.key}`)}</span>
                </Link>
              </li>
            );
          })}
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
