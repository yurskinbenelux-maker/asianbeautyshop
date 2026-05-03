// ─────────────────────────────────────────────────────────────────────────
// Hero C — Color Block Showcase (carousel + atmosphere).
//
// V4: the static "one product on a vermilion wall" became an interactive
// editorial carousel.
//
//   · Up to 5 products configured in /admin/homepage/hero land on the
//     vermilion side. Clicking the chevrons on the left/right edges
//     cycles. Clicking the product card itself navigates to that PDP.
//   · A thin curving SVG branch with bud dots sits in the upper-left
//     corner of the vermilion side — Korean-garden atmosphere, low
//     opacity cream so it never competes with the product.
//   · Sparse vermilion-tinted petals drift across both sides of the
//     hero, matching the Typography variant's motif so this variant
//     still feels native to the brand when Sofia switches between them.
//
// Client component — uses framer-motion AnimatePresence for the
// product crossfade and useState for the current carousel index.
//
// Backwards compat: when `products` is empty, the component derives a
// single product from the legacy `collageUrls[0]` so old configs keep
// working without intervention.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@/i18n/routing";
import { ArrowRight, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import type { HeroCopy } from "./hero-moon-jar";
import type { ColorBlockProduct } from "@/lib/queries/home-hero";

export function HeroCollage({
  copy,
  products,
  legacyImageUrl,
}: {
  copy: HeroCopy;
  /** Up to 5 products. Empty entries are ignored. */
  products: ColorBlockProduct[];
  /** Backwards-compat fallback when `products` is empty. */
  legacyImageUrl?: string;
}) {
  // Resolve the product list — drop empty entries; if nothing's
  // configured but the legacy single-image field is set, synthesise a
  // one-item carousel from it.
  const usable: ColorBlockProduct[] = products.filter(
    (p) => p.imageUrl.trim().length > 0,
  );
  if (usable.length === 0 && legacyImageUrl && legacyImageUrl.trim()) {
    usable.push({
      label: "",
      imageUrl: legacyImageUrl,
      href: "/shop",
    });
  }

  const [idx, setIdx] = useState(0);
  const safeIdx = Math.min(idx, Math.max(0, usable.length - 1));
  const current = usable[safeIdx];
  const total = usable.length;

  const next = () => setIdx((i) => (i + 1) % total);
  const prev = () => setIdx((i) => (i - 1 + total) % total);

  // Two-digit count for the editorial "N°01" — keeps the kerning even
  // whether you're at item 1 or item 12.
  const numberLabel = (n: number): string =>
    `N°${(n + 1).toString().padStart(2, "0")}`;

  return (
    <section
      className="relative overflow-hidden bg-rice"
      aria-labelledby="hero-headline"
    >
      {/* ── Floating petals — drift across the whole section. Same
          motif as the Typography hero so the variants share an
          atmosphere. ──────────────────────────────────────────── */}
      <Petals />

      <div className="relative grid min-h-[520px] grid-cols-12 md:min-h-[600px]">
        {/* ── Cream side — type column ────────────────────────── */}
        <div className="relative col-span-12 flex flex-col justify-center bg-rice px-6 py-14 md:col-span-7 md:px-12 md:py-16 lg:px-20 lg:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_30%_30%,rgba(232,171,127,0.12),transparent_70%)]"
          />

          <div className="relative">
            {/* Magazine kicker */}
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-px w-10 bg-vermilion" />
              <span className="text-[11px] uppercase tracking-label text-ink-mid">
                {copy.eyebrow}
              </span>
            </div>

            <h1
              id="hero-headline"
              className="mt-6 font-display text-[40px] leading-[1.08] text-ink sm:text-[48px] sm:leading-[1.02] md:text-[56px] md:leading-[0.96] lg:text-[72px]"
            >
              {copy.title_pre}{" "}
              <span className="italic text-vermilion">{copy.title_kr}</span>
              <br />
              <span className="italic">
                {splitFirstWord(copy.title_post).first}
              </span>{" "}
              {splitFirstWord(copy.title_post).rest}
            </h1>

            <p className="mt-6 max-w-md text-[15px] italic leading-[1.7] text-ink-mid md:text-[16px]">
              {copy.lede}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link
                href="/shop"
                className="group inline-flex items-center gap-3 bg-ink px-7 py-3 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion"
              >
                {copy.cta_primary}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/quiz"
                className="inline-flex items-center text-[12px] uppercase tracking-label text-ink underline-offset-4 transition-colors hover:text-vermilion hover:underline"
              >
                {copy.cta_secondary}
              </Link>
            </div>
          </div>
        </div>

        {/* ── Vermilion side — carousel + branch + caption ────── */}
        <div className="relative col-span-12 flex items-center justify-center overflow-hidden bg-vermilion p-8 md:col-span-5 md:p-12">
          {/* Branch silhouette — thin curving stem with bud dots in
              the upper-left corner. Cream at 18% opacity so it sits
              behind the product without competing. */}
          <BranchSilhouette />

          {/* N° editorial signpost — updates as the carousel turns. */}
          <div className="absolute left-6 top-6 z-10 font-display text-[15px] italic text-rice/85 md:left-8 md:top-8 md:text-[16px]">
            {current ? numberLabel(safeIdx) : "N°—"}
          </div>

          {/* Product card — clickable, with crossfade between products.
              The cream card frame ensures rectangular product shots
              (even on white backgrounds) read cleanly on vermilion. */}
          <div className="relative w-full max-w-[340px]">
            <AnimatePresence mode="wait">
              {current ? (
                <motion.figure
                  key={`${safeIdx}-${current.imageUrl}`}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                >
                  <ProductCard product={current} />
                </motion.figure>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex aspect-square w-full items-center justify-center bg-rice text-vermilion/40"
                >
                  <ImageOff className="h-8 w-8" aria-hidden />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Prev / next chevrons — only shown when there's more
              than one product. Cream-on-vermilion at low opacity so
              they invite without dominating; full cream on hover. */}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                aria-label="Previous product"
                className="group absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-rice/70 transition-colors hover:bg-rice/10 hover:text-rice md:left-4"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Next product"
                className="group absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-rice/70 transition-colors hover:bg-rice/10 hover:text-rice md:right-4"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Caption — Look number + product label + position
              indicator (1 / 3). Hairline rule for the editorial
              feel. */}
          {current && (
            <div className="absolute bottom-6 right-6 z-10 flex items-center gap-2 text-[10px] uppercase tracking-label text-rice/85 md:bottom-8 md:right-8">
              <span aria-hidden className="h-px w-4 bg-rice/50" />
              {current.label
                ? `${numberLabel(safeIdx)} · ${current.label}`
                : numberLabel(safeIdx)}
              {total > 1 && (
                <span className="ml-2 text-rice/60">
                  {safeIdx + 1}/{total}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ProductCard — square cream card with the photo. Clickable when href
// is set; renders a static figure when there's nothing to link to.
// ─────────────────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: ColorBlockProduct }) {
  const card = (
    <div className="relative aspect-square overflow-hidden bg-rice shadow-[0_24px_60px_-20px_rgba(26,26,26,0.4)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.imageUrl}
        alt={product.label || ""}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.03]"
      />
    </div>
  );

  if (product.href && product.href.trim()) {
    return (
      <Link
        href={product.href}
        className="block"
        aria-label={
          product.label ? `View ${product.label}` : "View product"
        }
      >
        {card}
      </Link>
    );
  }
  return card;
}

// ─────────────────────────────────────────────────────────────────────────
// BranchSilhouette — thin SVG stem with bud dots, low-opacity cream,
// pinned to the upper-left of the vermilion side. Decorative only —
// pointer-events-none so it doesn't interfere with the carousel.
// ─────────────────────────────────────────────────────────────────────────

function BranchSilhouette() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 240"
      className="pointer-events-none absolute -left-4 -top-4 h-44 w-36 text-rice md:-left-2 md:-top-2 md:h-56 md:w-44"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      {/* main stem — gentle S-curve descending from the top-left */}
      <path
        d="M 30 5 Q 40 50 50 95 Q 58 130 70 165 Q 80 195 95 220"
        strokeWidth="1.4"
        opacity="0.18"
      />
      {/* secondary branch — splits off mid-stem, curls right */}
      <path
        d="M 55 110 Q 80 105 105 95 Q 130 88 150 80"
        strokeWidth="1"
        opacity="0.14"
      />
      {/* small offshoot near the top */}
      <path
        d="M 38 40 Q 50 36 65 30"
        strokeWidth="0.9"
        opacity="0.12"
      />

      {/* buds — small filled circles along the branch */}
      <g fill="currentColor" opacity="0.22">
        <circle cx="50" cy="95" r="2.2" />
        <circle cx="70" cy="165" r="1.8" />
        <circle cx="95" cy="220" r="1.6" />
        <circle cx="105" cy="95" r="2" />
        <circle cx="65" cy="30" r="1.6" />
        <circle cx="135" cy="83" r="1.4" />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Petals — sparse vermilion dots that drift slowly. Six total —
// fewer than the Typography hero's 14 — so they're an accent, not the
// main motif. Pure CSS/keyframe animations via framer-motion's
// declarative API.
// ─────────────────────────────────────────────────────────────────────────

const PETAL_SEEDS = [
  { left: "18%", delay: 0, dur: 18, dx: -30, dy: 220, size: 5 },
  { left: "44%", delay: 4, dur: 22, dx: 60, dy: 260, size: 4 },
  { left: "62%", delay: 9, dur: 16, dx: -20, dy: 200, size: 6 },
  { left: "78%", delay: 2, dur: 24, dx: -50, dy: 240, size: 5 },
  { left: "32%", delay: 12, dur: 20, dx: 30, dy: 220, size: 4 },
  { left: "88%", delay: 7, dur: 19, dx: -10, dy: 230, size: 5 },
];

function Petals() {
  return (
    <>
      {PETAL_SEEDS.map((p, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute top-0 rounded-full bg-vermilion/45"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
          }}
          initial={{ y: -20, x: 0, opacity: 0 }}
          animate={{
            y: [0, p.dy],
            x: [0, p.dx],
            opacity: [0, 0.7, 0.7, 0],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helper — italicise the first word of `title_post` for editorial
// rhythm.
// ─────────────────────────────────────────────────────────────────────────

function splitFirstWord(s: string): { first: string; rest: string } {
  const trimmed = s.trim();
  if (!trimmed) return { first: "", rest: "" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { first: trimmed, rest: "" };
  return {
    first: trimmed.slice(0, idx),
    rest: trimmed.slice(idx + 1),
  };
}
