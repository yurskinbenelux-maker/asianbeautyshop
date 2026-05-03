// ─────────────────────────────────────────────────────────────────────────
// Hero C — Editorial Spread.
//
// V2: ditched the three-equal-cells grid (looked like a product catalogue
// the moment you stepped back) for a deliberate magazine-spread layout.
// Composition principles applied:
//
//   1. ONE dominant hero — the right-hand product image takes ~55% of
//      width and the full visual weight. The two supporting products
//      are demonstrably smaller, positioned as editorial "asides".
//   2. Type-led left column — same Fraunces headline as the typography
//      hero, but with a vermilion kicker rule above the eyebrow and the
//      lede set in italics for editorial cadence.
//   3. Asymmetric supporting products — small one floats top-right
//      ABOVE the hero, second floats bottom-left BELOW the type. They
//      visually frame the spread without competing.
//   4. Caption labels — tiny "Look 01 / Cushion" callout near the hero
//      product, signalling editorial styling. Like a magazine fashion
//      spread, not a category page.
//   5. Floating petals (low-key, fewer than the typography hero) for
//      brand continuity so this variant still feels like YU•R, not a
//      different site.
//
// Empty image slots fall back to soft cream placeholders so the layout
// never collapses if Sofia uploads two of three.
// ─────────────────────────────────────────────────────────────────────────

import { Link } from "@/i18n/routing";
import { ArrowRight, ImageOff } from "lucide-react";
import type { HeroCopy } from "./hero-moon-jar";

export function HeroCollage({
  copy,
  imageUrls,
}: {
  copy: HeroCopy;
  imageUrls: [string, string, string];
}) {
  const [hero, smallTop, smallBottom] = imageUrls;

  return (
    <section
      className="relative overflow-hidden bg-rice"
      aria-labelledby="hero-headline"
    >
      {/* Soft radial glow behind everything — same color story as the
          typography hero so the brand feels continuous when Sofia
          switches between variants. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_70%_30%,rgba(232,171,127,0.12),transparent_70%)]"
      />
      {/* Decorative petal motifs — far fewer than the typography hero,
          and positioned only at the edges so they don't fight the
          imagery. Pure CSS, no client JS. */}
      <span
        aria-hidden
        className="absolute left-[6%] top-[12%] h-2 w-2 rounded-full bg-vermilion/40"
      />
      <span
        aria-hidden
        className="absolute right-[8%] bottom-[18%] h-1.5 w-1.5 rounded-full bg-vermilion/30"
      />
      <span
        aria-hidden
        className="absolute left-[42%] top-[8%] h-1 w-1 rounded-full bg-vermilion/50"
      />

      <div className="container relative py-16 md:py-24 lg:py-28">
        {/* 12-col grid. We deliberately leave gaps in some cells — that's
            the negative space that makes the spread feel composed. */}
        <div className="grid grid-cols-12 gap-x-6 gap-y-10 md:gap-x-8">
          {/* ── small upper product — sits ABOVE the hero on the right,
              acting as a teaser for the spread below. Mobile: hidden;
              the layout flow already starts with the hero. ─────── */}
          <div className="hidden md:col-span-3 md:col-start-9 md:row-start-1 md:block md:translate-y-2">
            <Tile url={smallTop} ratio="1/1" caption="Look 02" />
          </div>

          {/* ── type column — the editorial heart. ─────────────── */}
          <div className="col-span-12 md:col-span-5 md:col-start-1 md:row-span-2 md:row-start-1 md:flex md:flex-col md:justify-center">
            {/* Kicker rule + eyebrow — the magazine-style "section
                header" that signals editorial intent. */}
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="h-px w-10 bg-vermilion"
              />
              <span className="text-[11px] uppercase tracking-label text-ink-mid">
                {copy.eyebrow}
              </span>
            </div>

            <h1
              id="hero-headline"
              className="mt-5 font-display text-display-md leading-[0.95] text-ink md:text-[68px] lg:text-[88px]"
            >
              {copy.title_pre}{" "}
              <span className="italic text-vermilion">{copy.title_kr}</span>
              <br />
              <span className="italic">{splitFirstWord(copy.title_post).first}</span>{" "}
              {splitFirstWord(copy.title_post).rest}
            </h1>

            <p className="mt-7 max-w-md text-[15px] italic leading-[1.7] text-ink-mid md:text-[16px]">
              {copy.lede}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-5">
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

          {/* ── hero product — the dominant visual. Cols 7-12 (almost
              half the canvas) so it visually outweighs the two
              supporting products combined. Slight upward translate
              so it crests above the type baseline — gives the spread
              that "object floating in space" feel. ──────────────── */}
          <div className="col-span-12 md:col-span-6 md:col-start-7 md:row-span-2 md:row-start-1 md:-translate-y-2">
            <Tile url={hero} ratio="3/4" priority />
          </div>

          {/* ── small lower product — anchors the bottom-left of the
              spread. Notably bigger than the upper one (asymmetry by
              scale) and offset right so it doesn't sit flush with the
              type column. Mobile: appears as the third item in flow. */}
          <div className="col-span-12 md:col-span-4 md:col-start-2 md:row-start-3 md:translate-x-6 md:-mt-12">
            <Tile url={smallBottom} ratio="4/3" caption="Look 03" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tile — the actual image cell. Carries an optional caption label that
// floats below the image in monospace small caps, like a magazine
// styling credit. Empty URL → soft placeholder.
// ─────────────────────────────────────────────────────────────────────────

function Tile({
  url,
  ratio,
  caption,
  priority,
}: {
  url: string;
  ratio: "1/1" | "3/4" | "4/3";
  caption?: string;
  priority?: boolean;
}) {
  // Tailwind's JIT only sees the literal classes — map the ratio enum
  // up front rather than interpolating into a template string.
  const ratioClass =
    ratio === "1/1"
      ? "aspect-square"
      : ratio === "3/4"
        ? "aspect-[3/4]"
        : "aspect-[4/3]";

  return (
    <figure>
      <div
        className={`${ratioClass} relative w-full overflow-hidden bg-rice-dim/60`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            // eager-load only the dominant hero so LCP is fast; the
            // supporting tiles can wait for their turn.
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-mid/60">
            <ImageOff className="h-5 w-5" aria-hidden />
          </div>
        )}
      </div>
      {caption && (
        <figcaption className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-label text-ink-mid">
          <span aria-hidden className="h-px w-4 bg-ink-mid/40" />
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helper — split a string at the first space so we can italicise just
// the first word of `title_post` (e.g. "quieter skin" → italic "quieter"
// + roman "skin"). Adds an editorial rhythm to the headline that the
// flat typography hero doesn't have.
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
