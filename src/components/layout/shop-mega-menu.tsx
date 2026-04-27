// ─────────────────────────────────────────────────────────────────────────
// ShopMegaMenu — hover/focus dropdown that lists every category under
// the SHOP nav item. Sits inside the desktop primary nav.
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

export type ShopMegaMenuCategory = {
  slug: string;
  name: string;
  count: number;
};

type Props = {
  categories: ShopMegaMenuCategory[];
};

/** ms before a hover-out closes the menu — covers the trigger ↔ panel gap. */
const HOVER_GRACE_MS = 120;

export function ShopMegaMenu({ categories }: Props) {
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

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      {/* Trigger — same visual rhythm as the other primary nav links.
          Click goes to /shop. Keyboard ArrowDown/Enter open the panel. */}
      <Link
        href="/shop"
        aria-haspopup="menu"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            // Move focus to the first menu item once it renders.
            window.requestAnimationFrame(() => {
              const first = wrapperRef.current?.querySelector<HTMLAnchorElement>(
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

      {/* Panel — anchored under the trigger. We position absolutely so
          it can overflow the header without relayout. */}
      <div
        role="menu"
        aria-label={t("shop")}
        className={cn(
          // Sits flush below the trigger; the `pt-3` on the inner card
          // creates the visual gap while still leaving the wrapper as
          // a single hover target — the cursor never crosses dead air.
          "absolute left-1/2 top-full z-40 -translate-x-1/2 pt-3 transition-all duration-150",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <div className="min-w-[260px] border border-ink/10 bg-rice/95 p-3 shadow-[0_12px_36px_-18px_rgba(0,0,0,0.25)] backdrop-blur-md">
          {/* All-products entry — same destination as clicking SHOP itself,
              but reads as a meaningful "browse the whole collection"
              when alongside the category list. */}
          <Link
            role="menuitem"
            href="/shop"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between gap-3 px-3 py-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <span>{tShop("all")}</span>
          </Link>

          <div className="my-1 border-t border-ink/10" aria-hidden />

          {categories.length === 0 ? (
            <p className="px-3 py-3 text-[12px] italic text-ink-mid">
              {/* Fallback when the catalogue is genuinely empty (fresh
                  install). Customers shouldn't see this on prod. */}
              {tShop("empty")}
            </p>
          ) : (
            <ul className="flex flex-col">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    role="menuitem"
                    href={`/shop/category/${c.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:bg-ink/5 hover:text-ink"
                  >
                    <span>{c.name}</span>
                    {c.count > 0 && (
                      <span className="text-[10px] tabular-nums text-ink-mid/70">
                        {c.count}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
