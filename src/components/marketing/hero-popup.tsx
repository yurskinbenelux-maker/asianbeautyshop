// ─────────────────────────────────────────────────────────────────────────
// HeroPopup — Variant B "Magazine mosaic".
//
// Layout (desktop):
//   ┌─ × ────────────────────────────────────────────────────────────┐
//   │ EYEBROW                  │ ┌────────┐  ┌────────┐              │
//   │                          │ │  P1    │  │  P2    │  (top row:   │
//   │ Big serif headline       │ │ square │  │ square │   2 squares) │
//   │                          │ └────────┘  └────────┘              │
//   │ ───                      │ ┌────────────────────┐              │
//   │ Short lede               │ │       P3           │  (wide hero) │
//   │                          │ └────────────────────┘              │
//   │                          │ ┌────┐ ┌────┐ ┌────┐                │
//   │ "Tap any piece →"        │ │ P4 │ │ P5 │ │ P6 │  (bottom: 3)   │
//   │ "Maybe later"            │ └────┘ └────┘ └────┘                │
//   └──────────────────────────┴──────────────────────────────────────┘
//
// Layout (mobile, sm-): type column stacks on top of the bento. Same
// product slot order, so position 1 is still top-left.
//
// Slot ordering is whatever the admin saved in `productIds[]`, in order.
// We deliberately don't tag slot 3 visually — Max wanted all six tiles
// to feel equal in weight, with only the bento sizing implying hierarchy.
// (Earlier draft had an "Editor's pick" pill on slot 3; killed per user
// feedback to keep the eye moving evenly around the grid.)
//
// Behaviour:
//   · Mounts on every page but only fires on the homepage routes
//     (/, /en, /nl, /fr, /ru). All admin/auth/cart/checkout/account
//     routes are blocklisted so the popup never gets in the way of a
//     conversion funnel.
//   · Awaits markWelcomeFinished() via the popup-coordinator so the
//     welcome popup never overlaps. Once welcome is finished, starts
//     the configurable delay timer.
//   · Calls markHeroFinished() on every exit path so the quiz popup
//     can chain in next.
//   · "Every visit" frequency — no localStorage suppression (an admin's
//     deliberate choice). Backdrop click / Escape / × / product tap
//     all dismiss.
//   · Clicking a product → navigates to its PDP and dismisses.
//   · Ignores the popup entirely if disabled, no products picked, or
//     fewer than 3 products survived (deletions etc.).
//   · Gracefully degrades: 3 = top row + hero, 4 = + 1 small,
//     5 = + 2 smalls, 6 = full bento.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
// Raw <img> for the bento tiles, NOT next/image. next/image rewrites
// src through /_next/image?url=…, which doesn't match the raw Supabase
// URL we preload from the layout <head> for the first card. The bento
// has up to 6 product images — using raw <img> + a JS prefetch of all
// six on mount means cache-hit paint when the modal fires (3s+ later).
import { X } from "lucide-react";

import {
  awaitWelcomeFinished,
  markHeroFinished,
} from "@/lib/marketing/popup-coordinator";
// Import from the types-only module — `hero-popup.ts` is server-only.
import type {
  HeroPopupCopy,
  HeroPopupProductCard,
} from "@/lib/queries/hero-popup-types";

/** Routes where the popup must NEVER fire. Same shape as the welcome
 *  popup blocklist so behaviour is predictable. The hero popup also
 *  bails on any route that isn't a homepage variant — the homepage is
 *  the only place this card makes sense. */
const SUPPRESSED_PATH_PATTERNS = [
  /^\/(?:en|nl|fr|ru)?\/?(?:sign-up|sign-in|account)(?:\/|$)/i,
  /^\/(?:en|nl|fr|ru)?\/?(?:cart|checkout)(?:\/|$)/i,
  /^\/admin(?:\/|$)/i,
  /^\/auth(?:\/|$)/i,
];

const HOMEPAGE_PATTERN = /^\/(?:en|nl|fr|ru)?\/?$/i;

export function HeroPopup({
  enabled,
  delaySeconds,
  copy,
  products,
  locale,
}: {
  enabled: boolean;
  delaySeconds: number;
  copy: HeroPopupCopy;
  products: HeroPopupProductCard[];
  locale: string;
}) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Bail early — every bail also resolves the coordinator promise so
    // the quiz popup's awaiter doesn't hang forever.
    if (!enabled) {
      markHeroFinished();
      return;
    }
    if (products.length < 3) {
      // Schema cap is 3-6 but render-time hydration can drop archived
      // products — guard so a half-empty popup never appears.
      markHeroFinished();
      return;
    }
    if (SUPPRESSED_PATH_PATTERNS.some((re) => re.test(pathname))) {
      markHeroFinished();
      return;
    }
    if (!HOMEPAGE_PATTERN.test(pathname)) {
      // Not a homepage — silently skip (and resolve the chain).
      markHeroFinished();
      return;
    }

    let cancelled = false;
    let timerId: number | undefined;
    void (async () => {
      // Wait for the welcome popup to finish (immediate if it never
      // appeared) THEN start our own delay timer.
      await awaitWelcomeFinished();
      if (cancelled) return;
      timerId = window.setTimeout(
        () => setOpen(true),
        delaySeconds * 1000,
      );
    })();
    return () => {
      cancelled = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [enabled, products.length, pathname, delaySeconds]);

  // PREFETCH + DECODE every product image as soon as the component
  // mounts (well before the welcome+delay chain fires). Same fix as
  // the welcome popup, just multiplied across up to 6 tiles. Without
  // this the bento appears at the delay tick but each tile pops in
  // 1-2s later on mobile as its image arrives over the wire.
  //
  // Why we don't just sprinkle priority="high" on next/image: the
  // tiles render as raw <img> (see import comment above) so the head
  // preload, this JS prefetch, and the rendered <img> all hit the
  // same URL → cache hit, no double-fetch.
  //
  // Gated on the same open conditions as the timer above so we don't
  // waste bandwidth prefetching 6 images on /admin or /checkout where
  // the popup will never fire.
  useEffect(() => {
    if (!enabled) return;
    if (products.length < 3) return;
    if (SUPPRESSED_PATH_PATTERNS.some((re) => re.test(pathname))) return;
    if (!HOMEPAGE_PATTERN.test(pathname)) return;
    for (const product of products) {
      if (!product.imageUrl) continue;
      const img = new window.Image();
      img.src = product.imageUrl;
      // decode() is unsupported in Safari < 15 — silently fall back
      // to the HTTP-cache-only win.
      void img.decode?.().catch(() => {});
    }
  }, [enabled, products, pathname]);

  function dismiss() {
    setOpen(false);
    markHeroFinished();
  }

  // Lock body scroll while open + close on Escape.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        background: "rgba(20,17,15,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "yur-hero-popup-fade 600ms ease both",
      }}
      onClick={(e) => {
        // Click outside the card → dismiss. Clicks inside don't bubble
        // because we stopPropagation on the card.
        if (e.target === e.currentTarget) dismiss();
      }}
      aria-modal="true"
      role="dialog"
      aria-label={copy.headline}
    >
      <style>{`
        @keyframes yur-hero-popup-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes yur-hero-popup-rise {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-ink/10 bg-rice"
        style={{ animation: "yur-hero-popup-rise 480ms 80ms ease both" }}
      >
        {/* close × */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center border border-ink/25 bg-rice/85 text-ink-mid transition-colors hover:border-ink hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="grid sm:grid-cols-[4fr_6fr]">
          {/* ── Left: type column ─────────────────────────────────── */}
          <div className="flex flex-col justify-between border-b border-ink/10 px-6 py-6 sm:border-b-0 sm:border-r sm:px-8 sm:py-9">
            <div>
              {copy.eyebrow.trim() && (
                <div className="text-[10px] uppercase tracking-[0.22em] text-vermilion">
                  {copy.eyebrow}
                </div>
              )}
              {copy.headline.trim() && (
                <h2 className="mt-3 font-display text-[26px] leading-[1.02] text-ink sm:text-[30px]">
                  {copy.headline}
                </h2>
              )}
              <div className="mt-4 h-px w-9 bg-ink/40" aria-hidden />
              {copy.lede.trim() && (
                <p className="mt-4 max-w-[28ch] text-[13px] leading-relaxed text-ink-mid">
                  {copy.lede}
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:mt-10">
              {copy.hintLabel.trim() && (
                <span className="text-[11px] uppercase tracking-label text-vermilion">
                  {copy.hintLabel}
                </span>
              )}
              {copy.skipLabel.trim() && (
                <button
                  type="button"
                  onClick={dismiss}
                  className="self-start text-[11px] text-ink-mid underline-offset-2 hover:underline"
                >
                  {copy.skipLabel}
                </button>
              )}
            </div>
          </div>

          {/* ── Right: bento mosaic ──────────────────────────────── */}
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <BentoMosaic
              products={products}
              locale={locale}
              onSelect={() => markHeroFinished()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bento ───────────────────────────────────────────────────────────────

/** The 3-tier mosaic. Positions:
 *    [0][1]          top row (2 squares)
 *    [   2   ]       wide hero (3:1 ratio, full width)
 *    [3][4][5]       bottom row (3 small squares)
 *
 * Tier 3 (the bottom row) collapses to fewer columns when the admin
 * picked fewer than 6 products, so a 4-pick saved set still feels
 * balanced (1 small centred) instead of leaving empty cells. */
function BentoMosaic({
  products,
  locale,
  onSelect,
}: {
  products: HeroPopupProductCard[];
  locale: string;
  onSelect: () => void;
}) {
  const top = products.slice(0, 2);
  const hero = products[2];
  const bottom = products.slice(3, 6);

  // Tailwind can't see dynamic `grid-cols-${n}` class names — JIT scans
  // for full literals. Pick from a fixed list.
  const topCols = top.length === 1 ? "grid-cols-1" : "grid-cols-2";
  const bottomCols =
    bottom.length === 1
      ? "grid-cols-1"
      : bottom.length === 2
      ? "grid-cols-2"
      : "grid-cols-3";

  return (
    <div className="grid gap-2">
      {top.length > 0 && (
        <div className={`grid gap-2 ${topCols}`}>
          {top.map((p) => (
            <BentoTile
              key={p.id}
              product={p}
              locale={locale}
              aspect="aspect-square"
              sizes="(max-width: 640px) 45vw, 200px"
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
      {hero && (
        <BentoTile
          product={hero}
          locale={locale}
          // 3:1 letterbox — wider than the square row above, but not so
          // narrow that the product is unrecognisable on mobile.
          aspect="aspect-[3/1]"
          sizes="(max-width: 640px) 92vw, 440px"
          onSelect={onSelect}
        />
      )}
      {bottom.length > 0 && (
        <div className={`grid gap-2 ${bottomCols}`}>
          {bottom.map((p) => (
            <BentoTile
              key={p.id}
              product={p}
              locale={locale}
              aspect="aspect-square"
              sizes="(max-width: 640px) 30vw, 145px"
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single image-led tile. Product name reads off a subtle gradient at
 *  the bottom of the image — keeps the tile editorial without making
 *  the popup feel like a list view.
 *
 *  Per-product object-position is applied via two CSS custom properties
 *  (mobile / desktop) and the matching arbitrary-value Tailwind classes.
 *  Same trick we use on the cinematic video hero, so the crop can
 *  differ between viewports without media-queries in JS. Empty strings
 *  fall back to the browser default of "center". */
function BentoTile({
  product,
  locale,
  aspect,
  sizes,
  onSelect,
}: {
  product: HeroPopupProductCard;
  locale: string;
  aspect: string;
  sizes: string;
  onSelect: () => void;
}) {
  const desktopPos = product.objectPositionDesktop?.trim() || "center";
  const mobilePos = product.objectPositionMobile?.trim() || "center";
  return (
    <Link
      href={`/${locale}/shop/${product.slug}`}
      onClick={onSelect}
      className="group relative block overflow-hidden border border-ink/10 bg-rice-dim transition-colors hover:border-ink/35"
    >
      <div className={`relative ${aspect}`}>
        {product.imageUrl ? (
          // Raw <img> — matches the URL the parent component prefetched
          // on mount, so this is almost always a cache hit by the time
          // the modal opens. `sizes` is no longer meaningful here
          // (raw img doesn't honour it the way next/image does), but
          // the layout's CSS already constrains the rendered size.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="eager"
            decoding="async"
            // Suppress the unused-vars lint without dropping the prop
            // from the function signature — `sizes` is still a useful
            // documentation hint about the intended render width.
            data-sizes={sizes}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04] [object-position:var(--yur-tile-pos-mobile)] md:[object-position:var(--yur-tile-pos-desktop)]"
            style={
              {
                "--yur-tile-pos-desktop": desktopPos,
                "--yur-tile-pos-mobile": mobilePos,
              } as React.CSSProperties
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-label text-ink-mid">
            No image
          </div>
        )}
        {/* readability gradient + name */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/35 to-transparent p-2 pt-8">
          <div className="line-clamp-2 text-[10.5px] font-medium leading-tight text-rice">
            {product.name}
          </div>
        </div>
      </div>
    </Link>
  );
}
