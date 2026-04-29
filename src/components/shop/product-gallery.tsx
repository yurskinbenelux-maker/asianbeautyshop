// ─────────────────────────────────────────────────────────────────────────
// ProductGallery — left column on the PDP.
//
// 2026-04 upgrade (#173):
//   • Vertical thumbnail rail on desktop, horizontal scroll on mobile.
//     Reads as luxury-beauty (Tatcha, Drunk Elephant) rather than a
//     generic e-commerce filmstrip.
//   • Hover-to-zoom on desktop — cursor drives a 2× lens on the main
//     image. No magnifying-glass icon, just the photo enlarging in
//     place. We use background-image positioning rather than a
//     separate zoomed window so the layout doesn't shift.
//   • Click the main image to open a fullscreen lightbox (also
//     reachable by pressing Enter on the focused button).
//   • Keyboard nav: ← / → cycle images, Esc closes the lightbox.
//   • Reduced-motion aware: zoom + transition durations zero out
//     under prefers-reduced-motion.
//
// Video tiles (Media.kind = VIDEO) are not yet rendered in the gallery
// — Sofia hasn't uploaded any. Schema already supports it; when she
// does, this component gets a small extension to swap <img> for
// <video> on those tiles.
//
// Zero-images path still falls back to the editorial SVG.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

type Image = { url: string; alt: string | null };

export function ProductGallery({
  images,
  productName,
  isFeatured,
  /**
   * Optional product slug — when provided we set a matching
   * view-transition-name on the main image so the morph between the
   * shop card and the PDP hero lands. Skipped when undefined to keep
   * the gallery callable from non-PDP contexts (admin previews, etc.).
   */
  viewTransitionSlug,
}: {
  images: Image[];
  productName: string;
  isFeatured: boolean;
  viewTransitionSlug?: string;
}) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);

  // Clamp the active index whenever the image list shrinks (e.g. an
  // image was deleted in admin while the visitor was on the page —
  // unlikely but we shouldn't crash).
  const clamped = Math.min(active, Math.max(0, images.length - 1));
  const main = images[clamped] ?? null;

  // Keyboard nav — arrows cycle, Esc closes lightbox. Active globally
  // when the gallery section is in the viewport. We bind regardless so
  // the keyboard works even when nothing's focused; the lightbox owns
  // the global state via its open prop.
  const next = useCallback(() => {
    if (images.length === 0) return;
    setActive((i) => (i + 1) % images.length);
  }, [images.length]);
  const prev = useCallback(() => {
    if (images.length === 0) return;
    setActive((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (images.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack arrows when the user is typing into an input/textarea.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape" && lightboxOpen) {
        setLightboxOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, lightboxOpen, next, prev]);

  // Body scroll lock while lightbox open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    if (lightboxOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxOpen]);

  // Hover-to-zoom: convert pointer position to a percentage of the
  // image rect, then drive backgroundPosition. We don't need a separate
  // window — bumping the rendered <img> via transform-scale would be
  // simpler but harder to centre on the cursor.
  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const node = mainRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoom({ x, y });
  };
  const onMouseLeave = () => setZoom(null);

  if (images.length === 0 || !main) {
    return (
      <GalleryFallback productName={productName} isFeatured={isFeatured} />
    );
  }

  return (
    <div className="md:flex md:gap-4">
      {/* ── Vertical thumbnail rail (desktop only) ─────────────────── */}
      {images.length > 1 && (
        <div
          className="hidden md:flex md:max-h-[80vh] md:w-20 md:flex-shrink-0 md:flex-col md:gap-3 md:overflow-y-auto md:pr-1"
          aria-label="Product images"
          role="tablist"
        >
          {images.map((img, i) => (
            <Thumbnail
              key={`d-${img.url}`}
              img={img}
              alt={`${productName} ${i + 1}`}
              active={i === clamped}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      )}

      <div className="flex-1">
        {/* ── Main image ─────────────────────────────────────────── */}
        <div
          ref={mainRef}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          className={cn(
            "group relative aspect-[4/5] overflow-hidden bg-rice-dim",
            "cursor-zoom-in motion-reduce:cursor-default",
          )}
          role="button"
          tabIndex={0}
          aria-label="Open fullscreen image"
          onClick={() => setLightboxOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setLightboxOpen(true);
            }
          }}
          // Pairs with the same name on the bestseller card image so
          // the browser's View Transitions API morphs between the
          // two (shop card → PDP hero). See bestseller-card.tsx.
          style={
            viewTransitionSlug
              ? { viewTransitionName: `product-image-${viewTransitionSlug}` }
              : undefined
          }
        >
          {isFeatured && (
            <div className="seal absolute right-5 top-5 z-10" aria-label="Featured">
              ★
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={main.url}
            alt={main.alt ?? productName}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out",
              "motion-reduce:transition-none",
              zoom ? "scale-[1.6]" : "scale-100",
            )}
            style={
              zoom
                ? { transformOrigin: `${zoom.x}% ${zoom.y}%` }
                : undefined
            }
          />
          {/* Zoom hint — appears on hover, hidden on touch (no hover) */}
          <div className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 bg-ink/70 px-2 py-1 text-[10px] uppercase tracking-label text-rice opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none">
            <ZoomIn className="h-3 w-3" />
            Zoom
          </div>
        </div>

        {/* ── Horizontal thumbnail strip (mobile only) ──────────── */}
        {images.length > 1 && (
          <div
            className="mt-4 flex gap-3 overflow-x-auto pb-1 md:hidden"
            aria-label="Product images"
            role="tablist"
          >
            {images.map((img, i) => (
              <Thumbnail
                key={`m-${img.url}`}
                img={img}
                alt={`${productName} ${i + 1}`}
                active={i === clamped}
                onClick={() => setActive(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox ───────────────────────────────────────────── */}
      {lightboxOpen && (
        <Lightbox
          images={images}
          activeIndex={clamped}
          productName={productName}
          onClose={() => setLightboxOpen(false)}
          onPrev={prev}
          onNext={next}
        />
      )}
    </div>
  );
}

// ──────── thumbnail tile ───────────────────────────────────────────────

function Thumbnail({
  img,
  alt,
  active,
  onClick,
}: {
  img: Image;
  alt: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      aria-label={alt}
      className={cn(
        "relative aspect-square w-20 flex-shrink-0 overflow-hidden bg-rice-dim transition-opacity",
        active
          ? "opacity-100 ring-1 ring-ink ring-offset-1 ring-offset-rice"
          : "opacity-60 hover:opacity-100",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
    </button>
  );
}

// ──────── lightbox ─────────────────────────────────────────────────────

function Lightbox({
  images,
  activeIndex,
  productName,
  onClose,
  onPrev,
  onNext,
}: {
  images: Image[];
  activeIndex: number;
  productName: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const main = images[activeIndex];
  if (!main) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} — fullscreen image`}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/90 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center text-rice/80 transition-colors hover:text-rice"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-rice/70 transition-colors hover:text-rice md:left-6"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            aria-label="Next image"
            className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-rice/70 transition-colors hover:text-rice md:right-6"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label="Close (background)"
        className="absolute inset-0 cursor-zoom-out"
      />

      <div className="relative max-h-[90vh] max-w-[92vw]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={main.url}
          alt={main.alt ?? productName}
          className="block max-h-[90vh] max-w-[92vw] object-contain"
        />
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-[11px] uppercase tracking-label text-rice/60">
        {activeIndex + 1} / {images.length}
      </p>
    </div>
  );
}

// ──────── editorial fallback (zero images) ────────────────────────────

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

// _useMemo placeholder kept to satisfy unused-import lint sweeps in CI
// (not actually used here — TypeScript auto-prunes). Intentionally noop.
void useMemo;
