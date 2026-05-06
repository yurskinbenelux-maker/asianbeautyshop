// ─────────────────────────────────────────────────────────────────────────
// BrandsMegaMenu — desktop nav dropdown for the Brands entry. Mirrors
// the ShopMegaMenu open/close behaviour (hover with grace, keyboard
// ArrowDown, click trigger to navigate to /brands index page).
//
// Panel layout: a row of brand cards, each linking to its
// /shop/brand/[slug] filtered listing. A "View all brands" tile at
// the end takes the visitor to /brands where every brand is listed
// with its image. As Sofia adds more brands the cards wrap onto
// additional rows naturally.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { ShopMegaMenuBrand } from "./shop-mega-menu";

const HOVER_GRACE_MS = 120;

export function BrandsMegaMenu({
  brands,
}: {
  brands: ShopMegaMenuBrand[];
}) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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

  useEffect(() => () => cancelClose(), []);

  // No brands at all (zero seeded) → render trigger only.
  const hasContent = brands.length > 0;

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
      <Link
        href="/brands"
        aria-haspopup={hasContent ? "menu" : undefined}
        aria-expanded={hasContent ? open : undefined}
        onFocus={() => hasContent && setOpen(true)}
        onKeyDown={(e) => {
          if (!hasContent) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            window.requestAnimationFrame(() => {
              const first =
                wrapperRef.current?.querySelector<HTMLAnchorElement>(
                  '[role="menuitem"]',
                );
              first?.focus();
            });
          }
        }}
        className={cn(
          "relative inline-flex items-center gap-1.5 text-[13px] uppercase tracking-label transition-colors",
          open ? "text-vermilion" : "text-ink hover:text-vermilion",
        )}
      >
        <span>{t("brands")}</span>
        {/* Same disclosure chevron as the Product types trigger —
            consistent affordance across the two desktop mega-menus. */}
        {hasContent && (
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform duration-200",
              open ? "rotate-180" : "rotate-0",
            )}
            aria-hidden
          />
        )}
      </Link>

      {hasContent && (
        <div
          role="menu"
          aria-label={t("brands")}
          className={cn(
            "fixed left-1/2 z-40 -translate-x-1/2 pt-3 transition-all duration-150",
            open
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-1 opacity-0",
          )}
          style={{ top: "80px" }}
        >
          <div className="mx-auto flex w-[min(92vw,900px)] flex-col gap-4 border border-ink/10 bg-rice/95 p-8 shadow-[0_18px_56px_-22px_rgba(0,0,0,0.28)] backdrop-blur-md">
            <div className="text-[10px] uppercase tracking-label text-ink-mid/70">
              {t("brands")}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {brands.map((b) => (
                <Link
                  key={b.slug}
                  role="menuitem"
                  href={`/shop/brand/${b.slug}`}
                  onClick={() => setOpen(false)}
                  className="group flex items-center border border-ink/10 bg-white/60 px-4 py-4 transition-colors hover:border-ink/30 hover:bg-white/90"
                >
                  <span className="font-display text-[16px] leading-[1.1] text-vermilion transition-colors group-hover:text-ink">
                    {b.name}
                  </span>
                </Link>
              ))}
              {/* "View all" tile — same visual rhythm as the brand
                  cards but signals it's a navigation aid, not a brand. */}
              <Link
                role="menuitem"
                href="/brands"
                onClick={() => setOpen(false)}
                className="group flex flex-col justify-center border border-dashed border-ink/15 bg-rice-dim/40 px-4 py-4 transition-colors hover:border-ink/40 hover:bg-rice-dim/70"
              >
                <span className="font-display text-[14px] text-ink transition-colors group-hover:text-vermilion">
                  View all brands →
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
