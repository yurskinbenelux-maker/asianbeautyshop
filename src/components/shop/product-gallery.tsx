// ─────────────────────────────────────────────────────────────────────────
// ProductGallery — the left column on the PDP.
//
// · Single image    → fills the frame
// · Multiple images → large main image on top, thumbnail row below
// · Zero images     → SVG tube fallback (same aesthetic as the shop grid)
//
// Client component only because thumbnail clicks swap the main image.
// No framer-motion here; the page is already busy enough.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Image = { url: string; alt: string | null };

export function ProductGallery({
  images,
  productName,
  isFeatured,
}: {
  images: Image[];
  productName: string;
  isFeatured: boolean;
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return <GalleryFallback productName={productName} isFeatured={isFeatured} />;
  }

  const main = images[active] ?? images[0];

  return (
    <div>
      {/* ── main image ───────────────────────────────────────── */}
      <div className="relative aspect-[4/5] overflow-hidden bg-rice-dim">
        {isFeatured && (
          <div className="seal absolute right-5 top-5 z-10" aria-label="Featured">
            ★
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={main.url}
          alt={main.alt ?? productName}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      {/* ── thumbnail strip (only if >1 image) ───────────────── */}
      {images.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              className={cn(
                "relative aspect-square w-20 flex-shrink-0 overflow-hidden bg-rice-dim transition-opacity",
                i === active
                  ? "opacity-100 ring-1 ring-ink"
                  : "opacity-60 hover:opacity-100",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt ?? `${productName} ${i + 1}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SVG fallback when no photos have been uploaded yet ────────────────

function GalleryFallback({
  productName,
  isFeatured,
}: {
  productName: string;
  isFeatured: boolean;
}) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-rice-dim">
      {isFeatured && (
        <div className="seal absolute right-5 top-5 z-10" aria-label="Featured">
          ★
        </div>
      )}
      <div className="flex h-full items-end justify-center pb-16">
        <svg viewBox="0 0 120 320" className="h-[78%]" aria-hidden>
          <rect
            x="20"
            y="60"
            width="80"
            height="220"
            rx="4"
            fill="#F8F4EC"
            stroke="#121110"
            strokeWidth="1.2"
          />
          <rect x="30" y="20" width="60" height="40" rx="2" fill="#C8102E" />
          <text
            x="60"
            y="180"
            textAnchor="middle"
            fill="#121110"
            fontFamily="serif"
            fontSize="14"
            letterSpacing="2"
          >
            YU.R
          </text>
        </svg>
      </div>
      <p className="absolute bottom-4 left-0 right-0 text-center text-[11px] uppercase tracking-label text-ink-mid">
        {productName}
      </p>
    </div>
  );
}
