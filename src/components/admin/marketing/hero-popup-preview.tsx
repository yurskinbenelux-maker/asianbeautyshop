// ─────────────────────────────────────────────────────────────────────────
// HeroPopupPreview — admin-side live preview of the magazine-mosaic
// welcome popup.
//
// Renders the same bento layout the public popup uses, but stripped of
// modal chrome (no fixed positioning, no backdrop, no body-scroll-lock)
// so it sits inline in the admin form. As the admin reorders products,
// adjusts crops, or edits copy, this component re-renders from props
// and shows exactly what visitors will see when the popup fires.
//
// Why this file exists separately from the public popup module:
//   · The public popup is a client component that ships with route-aware
//     mount/dismiss logic, the coordinator promise chain, escape-key
//     handling, etc. — overkill for a static preview.
//   · We also want products to be NON-clickable in the preview (clicking
//     a tile should not navigate away from /admin/marketing/hero-popup),
//     so the markup uses <div> instead of <Link>.
//
// Kept visually identical to the public popup. If the public layout
// changes, this file needs the same change — there's a small CSS-drift
// risk, but the alternative (sharing a "renderable in both modes"
// component) was significantly more code for not much benefit.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { X } from "lucide-react";
// eslint-disable-next-line @next/next/no-img-element
// We use <img> instead of next/image because the preview canvas is
// already inside a scaled-down admin shell — next/image's automatic
// sizing fights with the explicit aspect-ratio tiles in unhelpful ways
// and the bandwidth saving doesn't matter for ~6 images on an admin
// page that Sofia sees a few times a week.

import type {
  HeroPopupCopy,
  HeroPopupProductCard,
} from "@/lib/queries/hero-popup-types";

export function HeroPopupPreview({
  copy,
  products,
}: {
  copy: HeroPopupCopy;
  /** Same shape the public popup receives, including per-product
   *  object-position crops. Pass an empty array to render the empty
   *  state. */
  products: HeroPopupProductCard[];
}) {
  // Mirror the public popup's guard — fewer than 3 products = no popup.
  // Show a helpful placeholder so the admin understands what's missing.
  if (products.length < 3) {
    return (
      <div className="border border-dashed border-ink/15 bg-rice-dim/40 px-5 py-8 text-center text-[12px] text-ink-mid">
        Add at least 3 products above to see the popup preview.
      </div>
    );
  }

  return (
    <div
      // The faux modal backdrop — gives the preview the same "popup on
      // the page" framing customers see, without actually overlaying
      // anything in the admin.
      className="relative w-full overflow-hidden rounded-sm bg-ink/55 px-6 py-6"
      style={{ backdropFilter: "blur(0px)" }}
    >
      <div className="relative mx-auto w-full max-w-3xl border border-ink/10 bg-rice">
        {/* close × — purely visual */}
        <button
          type="button"
          disabled
          aria-hidden
          className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 cursor-default items-center justify-center border border-ink/25 bg-rice/85 text-ink-mid"
          tabIndex={-1}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="grid sm:grid-cols-[4fr_6fr]">
          {/* Left: type column */}
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
                <span className="self-start text-[11px] text-ink-mid">
                  {copy.skipLabel}
                </span>
              )}
            </div>
          </div>

          {/* Right: bento mosaic */}
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <PreviewBento products={products} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── preview bento (mirrors the public BentoMosaic) ──────────────────────

function PreviewBento({ products }: { products: HeroPopupProductCard[] }) {
  const top = products.slice(0, 2);
  const hero = products[2];
  const bottom = products.slice(3, 6);
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
            <PreviewTile key={p.id} product={p} aspect="aspect-square" />
          ))}
        </div>
      )}
      {hero && <PreviewTile product={hero} aspect="aspect-[3/1]" />}
      {bottom.length > 0 && (
        <div className={`grid gap-2 ${bottomCols}`}>
          {bottom.map((p) => (
            <PreviewTile key={p.id} product={p} aspect="aspect-square" />
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewTile({
  product,
  aspect,
}: {
  product: HeroPopupProductCard;
  aspect: string;
}) {
  // Honour the per-product object-position. We use the desktop crop
  // here because the admin preview canvas is the desktop width; the
  // same component on mobile would need to query a media query. For
  // an admin preview that's overkill — instead the picker shows the
  // mobile preview in its own panel.
  const pos = product.objectPositionDesktop?.trim() || "center";
  return (
    <div className="group relative block overflow-hidden border border-ink/10 bg-rice-dim">
      <div className={`relative ${aspect}`}>
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: pos }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-label text-ink-mid">
            No image
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/35 to-transparent p-2 pt-8">
          <div className="line-clamp-2 text-[10.5px] font-medium leading-tight text-rice">
            {product.name}
          </div>
        </div>
      </div>
    </div>
  );
}
