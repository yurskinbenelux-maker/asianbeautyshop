// ─────────────────────────────────────────────────────────────────────────
// ShopMegaMenu — hover/focus dropdown that lists every category tree
// (parents + their subcategories) plus the brand list. Sits inside the
// desktop primary nav.
//
// Layout:
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │ [Cleansers]    [Toners]    [Treatments]   │  By brand        │
//   │  · Oil Cleansers   · Hydrating  · Essences │  · YU.R          │
//   │  · Cleansing Balms · Calming    · Serums   │  · YU.R Pro      │
//   │  · Micellar        · Mist       · Ampoules │  · YU.R Me       │
//   │  …                  …            …          │                  │
//   └──────────────────────────────────────────────────────────────┘
//
// Three opening modes:
//   1. Pointer hover — opens after the cursor enters the trigger or
//      panel; closes after a small grace delay when the cursor leaves
//      both. The grace prevents flicker when the user diagonally swipes
//      across the gap from trigger → panel.
//   2. Keyboard focus — Tab onto the SHOP link, ArrowDown / Enter open
//      the menu. Esc closes. Focus moves into the panel naturally.
//   3. Click on SHOP — does NOT open the menu; goes straight to /shop
//      (the next-intl Link's default). Customers who want the broad
//      page get there without a popup blocking the view.
//
// The trigger is rendered as a Link so SSR + crawlers see a normal
// "/shop" anchor. Hover state lives entirely in the parent wrapper —
// no client-state on the link itself.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export type ShopMegaMenuParent = {
  slug: string;
  name: string;
  count: number;
  children: Array<{ slug: string; name: string; count: number }>;
};

export type ShopMegaMenuBrand = {
  slug: string;
  name: string;
  count: number;
};

type Props = {
  /** Top-level categories with their (non-empty) children. */
  tree: ShopMegaMenuParent[];
  /** Active brands with at least one published product. */
  brands: ShopMegaMenuBrand[];
};

/** ms before a hover-out closes the menu — covers the trigger ↔ panel gap. */
const HOVER_GRACE_MS = 120;

export function ShopMegaMenu({ tree, brands }: Props) {
  const t = useTranslations("nav");
  const tShop = useTranslations("shop");
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Cancel a pending close. Called when the cursor re-enters either the
  // trigger or the panel — this is what makes the diagonal hand-off
  // forgiving.
  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, HOVER_GRACE_MS);
  };

  // Esc closes the menu when it has focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // If focus leaves both the trigger and the panel (e.g. tab past the
  // last menu item), close. Without this the menu lingers open while
  // the user is no longer inside it.
  useEffect(() => {
    if (!open) return;
    const onFocusOut = (e: FocusEvent) => {
      if (
        wrapperRef.current &&
        e.relatedTarget instanceof Node &&
        !wrapperRef.current.contains(e.relatedTarget)
      ) {
        setOpen(false);
      }
    };
    const node = wrapperRef.current;
    node?.addEventListener("focusout", onFocusOut);
    return () => node?.removeEventListener("focusout", onFocusOut);
  }, [open]);

  // Cleanup any pending timer on unmount.
  useEffect(() => {
    return () => cancelClose();
  }, []);

  // No content at all (fresh install with no products) → render trigger
  // only, skip the panel entirely. Customers shouldn't see an empty
  // dropdown taunting them with "no categories yet".
  const hasContent = tree.length > 0 || brands.length > 0;

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => {
        if (!hasContent) return;
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      {/* Trigger — same visual rhythm as the other primary nav links.
          Click goes to /shop. Keyboard ArrowDown/Enter open the panel. */}
      <Link
        href="/shop"
        aria-haspopup={hasContent ? "menu" : undefined}
        aria-expanded={hasContent ? open : undefined}
        onFocus={() => hasContent && setOpen(true)}
        onKeyDown={(e) => {
          if (!hasContent) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            // Move focus to the first menu item once it renders.
            window.requestAnimationFrame(() => {
              const first =
                wrapperRef.current?.querySelector<HTMLAnchorElement>(
                  '[role="menuitem"]',
                );
              first?.focus();
            });
          }
        }}
        className="relative text-[13px] uppercase tracking-label text-ink transition-colors hover:text-vermilion"
      >
        {t("shop")}
      </Link>

      {/* Panel — anchored under the trigger and centered. Width grows
          with content but is capped at the viewport's container width
          minus a little so it doesn't kiss the edges on smaller
          desktops. */}
      {hasContent && (
        <div
          role="menu"
          aria-label={t("shop")}
          className={cn(
            // pt-3 creates the visual gap to the nav while the wrapper
            // stays a single hover target — cursor never crosses dead
            // air en route from trigger to panel.
            "fixed left-1/2 top-[calc(var(--header-h,80px))] z-40 -translate-x-1/2 pt-3 transition-all duration-150",
            open
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-1 opacity-0",
          )}
          // Inline style anchors the panel right under the nav (h-20 =
          // 80px on md+; matches the header height in nav.tsx). No JS
          // measurement — the value is constant.
          style={{ top: "80px" }}
        >
          <div className="mx-auto flex w-[min(92vw,1100px)] gap-8 border border-ink/10 bg-rice/95 p-8 shadow-[0_18px_56px_-22px_rgba(0,0,0,0.28)] backdrop-blur-md">
            {/* ── Categories: column-fluid grid ─────────────────────
                Each parent gets its own visual column. We let the
                grid auto-fill — 4 parents on most desktop widths,
                3 on narrower viewports. Inside each parent, children
                stack as a tight list. Parents with no children just
                render the parent link by itself. */}
            <div className="flex-1">
              <div className="mb-3 text-[10px] uppercase tracking-label text-ink-mid/70">
                {tShop("by_category")}
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
                {tree.map((parent) => (
                  <div key={parent.slug} className="min-w-0">
                    {/* Parent — bolder, slightly larger, the column
                        header. Clicking takes you to the parent's
                        landing page so customers can browse the whole
                        category. */}
                    <Link
                      role="menuitem"
                      href={`/shop/category/${parent.slug}`}
                      onClick={() => setOpen(false)}
                      className="font-display text-[14px] text-ink transition-colors hover:text-vermilion"
                    >
                      {parent.name}
                    </Link>
                    {parent.children.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-1.5">
                        {parent.children.map((child) => (
                          <li key={child.slug}>
                            <Link
                              role="menuitem"
                              href={`/shop/category/${child.slug}`}
                              onClick={() => setOpen(false)}
                              className="block text-[12px] text-ink-mid transition-colors hover:text-vermilion"
                            >
                              {child.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {/* All-products entry — same destination as clicking SHOP
                  itself, but reads as a meaningful "browse the whole
                  collection" when alongside the category list. Set
                  apart with a hairline so it doesn't fight the column
                  grid. */}
              <div className="mt-8 border-t border-ink/10 pt-4">
                <Link
                  role="menuitem"
                  href="/shop"
                  onClick={() => setOpen(false)}
                  className="text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
                >
                  {tShop("all")} →
                </Link>
              </div>
            </div>

            {/* ── Brands column ─────────────────────────────────────
                Right rail. Always rendered (even with one brand) so
                the visual balance of the panel stays consistent. The
                vertical hairline separates it from the category grid;
                w-px keeps the rule crisp on retina. */}
            {brands.length > 0 && (
              <>
                <div className="w-px shrink-0 self-stretch bg-ink/10" />
                <div className="w-[200px] shrink-0">
                  <div className="mb-3 text-[10px] uppercase tracking-label text-ink-mid/70">
                    {tShop("by_brand")}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {brands.map((b) => (
                      <li key={b.slug}>
                        <Link
                          role="menuitem"
                          href={`/shop/brand/${b.slug}`}
                          onClick={() => setOpen(false)}
                          className="block text-[12px] text-ink transition-colors hover:text-vermilion"
                        >
                          {b.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
