// ─────────────────────────────────────────────────────────────────────────
// Top navigation — hanji-white backdrop, hairline underline on scroll.
// Structure: YU.R wordmark (left) · primary links (center) · utility (right)
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/routing";
import { ChevronDown, Instagram, Menu, Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { CartButton } from "@/components/cart/cart-button";
import { SearchOverlay } from "./search-overlay";
import { Logo } from "@/components/brand/logo";
import {
  ShopMegaMenu,
  type ShopMegaMenuCategory,
} from "@/components/layout/shop-mega-menu";

export function Nav({
  shopCategories = [],
}: {
  /** Categories rendered inside the SHOP hover-menu. Fetched once at the
   *  layout level so every page reuses the same query. Default `[]` keeps
   *  storybook / preview mounts working without prop noise. */
  shopCategories?: ShopMegaMenuCategory[];
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Shop accordion state inside the mobile drawer. Defaults closed so
  // visitors who only want a different section don't see a wall of
  // categories first.
  const [mobileShopOpen, setMobileShopOpen] = useState(false);

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

  // ESC closes the mobile drawer, matching the search overlay convention.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Lock body scroll while the drawer is open so the page doesn't scroll
  // behind it on iOS. We also prevent the rubber-band overscroll by
  // setting `overflow:hidden` on <body>; restoring on close.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = prev;
    }
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Auto-dismiss the drawer on navigation. Without this, tapping a link
  // inside the drawer would change the route but leave the drawer mounted
  // on top of the new page (because the next-intl Link doesn't unmount
  // anything on click).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Collapse the Shop accordion whenever the drawer fully closes so the
  // next open starts from a clean primary list rather than mid-expansion.
  useEffect(() => {
    if (!mobileOpen) setMobileShopOpen(false);
  }, [mobileOpen]);

  return (
    <header
      // z-[60] sits above the AI concierge orb (~z-50) and any cookie
      // banner — without it the hamburger button can become un-tappable
      // on scroll when an absolutely-positioned element above the fold
      // (hero gradient, decorative SVG) creates a stacking context that
      // catches taps. Belt-and-braces.
      className={cn(
        "sticky top-0 z-[60] w-full transition-colors duration-300",
        scrolled ? "glass border-b border-ink/5" : "bg-transparent",
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-3 md:h-20 md:gap-6">
        {/* ── Hamburger (mobile only) ──────────────────────────────── */}
        {/* Sits on the leading edge — the conventional spot for mobile
            menu triggers and the easiest one for thumb reach. Hidden on
            md+ where the inline primary nav is visible. */}
        <button
          type="button"
          aria-label={t("nav.open_menu")}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-drawer"
          onClick={() => setMobileOpen(true)}
          className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:text-vermilion md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* ── Wordmark ─────────────────────────────────────────────── */}
        {/* Real brand logo — wordmark variant (tagline cropped off for nav).
            The 유 seal that used to sit beside it has been retired; the
            vector wordmark carries the brand on its own now.
            Height is generous — the stretched letterforms need vertical
            room to read as a luxury mark rather than a tiny smudge. */}
        <Link
          href="/"
          className="flex items-center"
          aria-label={t("brand.name")}
        >
          {/* height=48 reads comfortably inside the h-16 mobile nav (64px)
              and h-20 desktop nav (80px) without overwhelming either. */}
          <Logo variant="wordmark" height={48} alt={t("brand.name")} />
        </Link>

        {/* ── Instagram link — sits right next to the wordmark on every
            viewport so visitors see the social channel without scrolling.
            Plain anchor, no API, no auth — opens the IG profile in a new
            tab. Update the href if the handle ever changes. */}
        <a
          href="https://www.instagram.com/yur_skin_cosmetics/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("nav.instagram")}
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center text-ink-mid transition-colors hover:text-vermilion"
        >
          <Instagram className="h-4 w-4" aria-hidden />
        </a>

        {/* ── Primary navigation (desktop only) ────────────────────── */}
        {/* SHOP is rendered as a hover/focus mega-menu — clicking the
            word still navigates to /shop, but hovering reveals every
            category in a small panel below. The other primary links
            stay simple text anchors. */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          <ShopMegaMenu categories={shopCategories} />
          {/* Skin quiz replaces the old "Rituals" header link — the quiz
              is the higher-intent funnel into product recommendations.
              The /rituals editorial page still exists and is reachable
              from the footer + journal entries.
              Tiny vermilion -15% chip below the link is the visible
              hook that drives quiz starts: registered customers who
              complete the quiz get 15% off the recommended bundle
              (see /lib/quiz/reward.ts). Pure CSS, no runtime cost. */}
          <span className="relative inline-flex flex-col items-center">
            <NavLink href="/quiz">{t("nav.skin_quiz")}</NavLink>
            <span className="pointer-events-none absolute top-full mt-1 inline-flex items-center bg-vermilion px-1.5 py-px text-[9px] font-medium uppercase tracking-label text-rice">
              −15%
            </span>
          </span>
          <NavLink href="/ingredients">{t("nav.ingredients")}</NavLink>
          <NavLink href="/journal">{t("nav.journal")}</NavLink>
          <NavLink href="/about">{t("nav.about")}</NavLink>
        </nav>

        {/* ── Utility ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* LocaleSwitcher hidden on the smallest screens to make room for
              the icon row + hamburger. It's always available inside the
              mobile drawer below. */}
          <div className="hidden sm:block">
            <LocaleSwitcher />
          </div>
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

      {/* ── Mobile drawer ────────────────────────────────────────── */}
      {/* A simple slide-in left panel. Always rendered (not conditionally
          mounted) so the slide animation runs in both directions; visibility
          is gated on `mobileOpen` via translate-x + opacity. */}
      <div
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.menu")}
        className={cn(
          "fixed inset-0 z-[80] md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        {/* Backdrop — click to dismiss. Fades. */}
        <button
          type="button"
          aria-label={t("nav.close_menu")}
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 bg-ink/40 transition-opacity duration-300",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          tabIndex={mobileOpen ? 0 : -1}
        />
        {/* Panel — slides in from the leading edge. Width is capped at
            85vw so a sliver of backdrop remains tappable for dismiss. */}
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[85vw] max-w-[360px] flex-col bg-rice transition-transform duration-300 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {/* Header strip mirrors the main nav height for visual rhyme */}
          <div className="flex h-16 items-center justify-between border-b border-ink/10 px-5">
            <span className="font-display text-[16px] uppercase tracking-label text-ink">
              {t("nav.menu")}
            </span>
            <button
              type="button"
              aria-label={t("nav.close_menu")}
              onClick={() => setMobileOpen(false)}
              className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:text-vermilion"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Primary links — large, generous spacing so they're easy to
              tap on a phone. 56px row height beats Apple HIG's 44px floor.
              Shop is special: it's a button that expands an inline
              accordion of live-product categories. The "Shop" label
              itself does NOT navigate to /shop — the accordion's "View
              all products" link does, so a single tap on Shop never
              dumps the visitor onto a generic listing when they
              probably wanted a specific category. */}
          <nav
            className="flex-1 overflow-y-auto px-5 py-6"
            aria-label="Mobile primary"
          >
            <ul className="flex flex-col">
              {/* Shop accordion */}
              <li>
                <button
                  type="button"
                  aria-expanded={mobileShopOpen}
                  aria-controls="mobile-shop-categories"
                  onClick={() => setMobileShopOpen((v) => !v)}
                  className="flex h-14 w-full items-center justify-between text-[15px] uppercase tracking-label text-ink transition-colors hover:text-vermilion"
                >
                  <span>{t("nav.shop")}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      mobileShopOpen ? "rotate-180" : "rotate-0",
                    )}
                  />
                </button>
                {/* Categories — inline accordion, not a flyout. Tap any
                    category to land on /shop/category/[slug]. The "View
                    all" row at the bottom takes the visitor to /shop
                    if no specific category fits. Shown only when at
                    least one category has live products. */}
                <div
                  id="mobile-shop-categories"
                  className={cn(
                    "overflow-hidden border-l-2 border-vermilion/20 pl-3 transition-[max-height,opacity] duration-300",
                    mobileShopOpen
                      ? "max-h-[600px] opacity-100"
                      : "max-h-0 opacity-0",
                  )}
                >
                  <ul className="flex flex-col py-2">
                    {shopCategories.map((c) => (
                      <li key={c.slug}>
                        <Link
                          href={`/shop/category/${c.slug}`}
                          onClick={() => setMobileOpen(false)}
                          className="flex h-11 items-center justify-between text-[13px] text-ink transition-colors hover:text-vermilion"
                        >
                          <span>{c.name}</span>
                          <span className="text-[11px] text-ink-mid">
                            {c.count}
                          </span>
                        </Link>
                      </li>
                    ))}
                    {/* Always offer the broad "View all" — useful when
                        the visitor doesn't know which category fits. */}
                    <li>
                      <Link
                        href="/shop"
                        onClick={() => setMobileOpen(false)}
                        className="flex h-11 items-center text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
                      >
                        {t("nav.shop_all")}
                      </Link>
                    </li>
                  </ul>
                </div>
              </li>

              {/* Remaining primary links — plain anchors.
                  Skin quiz replaces the old Rituals link to align with
                  the desktop nav (the page itself is still reachable
                  via the footer). The quiz row carries an inline
                  −15% chip — same visual hook as the desktop nav. */}
              <li>
                <Link
                  href="/quiz"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-14 items-center gap-2 text-[15px] uppercase tracking-label text-ink transition-colors hover:text-vermilion"
                >
                  {t("nav.skin_quiz")}
                  <span className="inline-flex items-center bg-vermilion px-1.5 py-px text-[10px] font-medium uppercase tracking-label text-rice">
                    −15%
                  </span>
                </Link>
              </li>
              {[
                { href: "/ingredients", key: "ingredients" as const },
                { href: "/journal", key: "journal" as const },
                { href: "/about", key: "about" as const },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex h-14 items-center text-[15px] uppercase tracking-label text-ink transition-colors hover:text-vermilion"
                  >
                    {t(`nav.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer of the drawer — locale switcher (always available
              here regardless of viewport width) + a quiet sign-in shortcut. */}
          <div className="flex items-center justify-between gap-4 border-t border-ink/10 px-5 py-4">
            <LocaleSwitcher />
            <Link
              href="/account"
              onClick={() => setMobileOpen(false)}
              className="text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
            >
              {t("nav.account")}
            </Link>
          </div>
        </aside>
      </div>
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
