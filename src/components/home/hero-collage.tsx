// ─────────────────────────────────────────────────────────────────────────
// Hero C — Editorial Split (compact).
//
// V3 fixes the two real problems with V2:
//
//   1. Three image cells were placed in the same grid row, so the hero
//      sat ON TOP of the upper teaser — Sofia only ever saw one image.
//   2. Hero used `aspect-[3/4]` portrait, which on a ~700 px column
//      blows out to ~930 px tall — eats the whole viewport, hides the
//      video reel below, requires a scroll to even see the bestsellers.
//
// V3 layout — bounded height, no overlap, all three images visible:
//
//   ┌────────────────────────────┬───────────────────────────────────┐
//   │  ─── eyebrow                │                                   │
//   │                             │                                   │
//   │  THE FIRST 첫               │         HERO PRODUCT              │
//   │  GESTURE OF A               │         (4:3 landscape)           │
//   │  QUIETER skin               │                                   │
//   │                             │                                   │
//   │  italic lede…               └───────────────────────────────────┘
//   │                             ┌────────────┐  ┌─────────────────┐
//   │  [shop]    [find ritual]    │   Look 02  │  │     Look 03     │
//   │                             └────────────┘  └─────────────────┘
//   └─────────────────────────────────────────────────────────────────┘
//
//   · Type column on the left (5/12).
//   · Hero image right (7/12), aspect-[4/3] so it doesn't tower.
//   · Two supporting products below the hero, asymmetric widths
//     (small + slightly larger) — anchors the spread, makes use of all
//     three images, and keeps the section short enough that the video
//     reel below stays visible without scrolling on a 1080 p screen.
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
  const [hero, lookA, lookB] = imageUrls;

  return (
    <section
      className="relative overflow-hidden bg-rice"
      aria-labelledby="hero-headline"
    >
      {/* Soft brand-continuity glow + sparse vermilion petals — same
          atmosphere as the Typography hero so the variant switch
          doesn't feel like landing on a different site. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_55%_at_75%_30%,rgba(232,171,127,0.10),transparent_70%)]"
      />
      <span
        aria-hidden
        className="absolute left-[8%] top-[14%] h-1.5 w-1.5 rounded-full bg-vermilion/40"
      />
      <span
        aria-hidden
        className="absolute right-[10%] bottom-[12%] h-1 w-1 rounded-full bg-vermilion/35"
      />

      <div className="container relative py-12 md:py-16 lg:py-20">
        <div className="grid grid-cols-12 gap-x-6 gap-y-8 md:gap-x-8 md:gap-y-6">
          {/* ── type column ─────────────────────────────────────── */}
          <div className="col-span-12 md:col-span-5 md:col-start-1 md:flex md:flex-col md:justify-center">
            {/* Magazine kicker — vermilion rule + eyebrow. */}
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-px w-10 bg-vermilion" />
              <span className="text-[11px] uppercase tracking-label text-ink-mid">
                {copy.eyebrow}
              </span>
            </div>

            <h1
              id="hero-headline"
              className="mt-5 font-display text-display-md leading-[0.96] text-ink md:text-[56px] lg:text-[68px]"
            >
              {copy.title_pre}{" "}
              <span className="italic text-vermilion">{copy.title_kr}</span>
              <br />
              <span className="italic">
                {splitFirstWord(copy.title_post).first}
              </span>{" "}
              {splitFirstWord(copy.title_post).rest}
            </h1>

            <p className="mt-6 max-w-md text-[15px] italic leading-[1.7] text-ink-mid">
              {copy.lede}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-5">
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

          {/* ── hero image (right, top) ─────────────────────────── */}
          <div className="col-span-12 md:col-span-7 md:col-start-6">
            <Tile url={hero} ratio="4/3" priority />
          </div>

          {/* ── two supporting products under the hero, asymmetric
              widths so the strip doesn't read as a perfect 50/50. ─ */}
          <div className="col-span-12 grid grid-cols-12 gap-3 md:col-span-7 md:col-start-6 md:gap-4">
            <figure className="col-span-5">
              <Tile url={lookA} ratio="4/3" caption="Look 02" />
            </figure>
            <figure className="col-span-7">
              <Tile url={lookB} ratio="4/3" caption="Look 03" />
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tile — image cell with optional figcaption-style label. Empty URL
// renders a soft placeholder so the layout never collapses.
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
  const ratioClass =
    ratio === "1/1"
      ? "aspect-square"
      : ratio === "3/4"
        ? "aspect-[3/4]"
        : "aspect-[4/3]";

  return (
    <>
      <div
        className={`${ratioClass} relative w-full overflow-hidden bg-rice-dim/60`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
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
        <figcaption className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-label text-ink-mid">
          <span aria-hidden className="h-px w-4 bg-ink-mid/40" />
          {caption}
        </figcaption>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helper — split a string at the first space so we can italicise just
// the first word of `title_post` for editorial rhythm.
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
