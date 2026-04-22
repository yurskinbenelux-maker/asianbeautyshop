// ─────────────────────────────────────────────────────────────────────────
// Top navigation — hanji-white backdrop, hairline underline on scroll.
// Structure: YU.R wordmark (left) · primary links (center) · utility (right)
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { CartButton } from "@/components/cart/cart-button";
import { SearchOverlay } from "./search-overlay";

export function Nav() {
  const t = useTranslations();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Keyboard shortcut — ⌘K / Ctrl-K opens the search overlay, the
  // convention users expect from any modern e-commerce site.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-colors duration-300",
        scrolled ? "glass border-b border-ink/5" : "bg-transparent"
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-6 md:h-20">
        {/* ── Wordmark ─────────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-3" aria-label={t("brand.name")}>
          <span className="font-display text-[22px] tracking-tight text-ink">
            YU.R
          </span>
          <span className="seal" aria-hidden>
            유
          </span>
        </Link>

        {/* ── Primary navigation ───────────────────────────────────── */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          <NavLink href="/shop">{t("nav.shop")}</NavLink>
          <NavLink href="/rituals">{t("nav.rituals")}</NavLink>
          <NavLink href="/ingredients">{t("nav.ingredients")}</NavLink>
          <NavLink href="/journal">{t("nav.journal")}</NavLink>
          <NavLink href="/about">{t("nav.about")}</NavLink>
        </nav>

        {/* ── Utility ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <IconBtn
            label={t("nav.search")}
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={t("nav.account")} href="/account">
            <User className="h-4 w-4" />
          </IconBtn>
          {/* Cart opens a drawer, not a page — so it's not an IconBtn */}
          <CartButton label={t("nav.cart")} />
        </div>
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative text-[13px] uppercase tracking-label text-ink transition-colors hover:text-vermilion"
    >
      {children}
    </Link>
  );
}

function IconBtn({
  children,
  label,
  href,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const classes =
    "flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:text-vermilion";
  if (href) {
    return (
      <Link href={href} aria-label={label} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      className={classes}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
