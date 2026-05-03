// ─────────────────────────────────────────────────────────────────────────
// Hero C — Editorial Collage.
//
// Asymmetric three-product magazine layout:
//
//   ┌──────────────┐                  ┌──────┐
//   │              │  THE FIRST 첫    │ small│
//   │  hero        │  GESTURE OF A    │  1   │
//   │  product     │  QUIETER SKIN    └──────┘
//   │  (large)     │  ─ lede ─       ┌────────┐
//   │              │  [shop]         │ small  │
//   └──────────────┘                 │  2     │
//                                    └────────┘
//
// On desktop the three image columns share the viewport with the type
// column slipping between them. On mobile (< md) the layout collapses to:
//   1. hero product full-width (4:5)
//   2. type block
//   3. two smaller products side by side as a row
//   4. CTAs
//
// All three image URLs are optional individually — empty slots fall back
// to a soft cream placeholder so Sofia can ship in stages.
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
  const [hero, small1, small2] = imageUrls;

  return (
    <section
      className="container relative py-16 md:py-24"
      aria-labelledby="hero-headline"
    >
      {/* eyebrow + lede mast at the very top */}
      <div className="max-w-2xl">
        <div className="eyebrow">{copy.eyebrow}</div>
      </div>

      {/* main collage — 12-col grid that lets us place the type in the
          middle column while the products flank it asymmetrically. */}
      <div className="mt-8 grid grid-cols-1 gap-6 md:mt-12 md:grid-cols-12 md:gap-8">
        {/* left: large hero product */}
        <div className="md:col-span-5 md:col-start-1 md:row-span-2 md:row-start-1">
          <CollageTile url={hero} ratio="4/5" alt="" />
        </div>

        {/* center: typography column. Sits between the large left and
            the stacked smaller right column. Slight top-padding on
            desktop so the type lines up with the middle of the hero
            product, not its top — feels editorial. */}
        <div className="md:col-span-4 md:col-start-6 md:row-span-2 md:row-start-1 md:flex md:flex-col md:justify-center md:pt-4">
          <h1
            id="hero-headline"
            className="font-display text-display-md leading-[0.95] text-ink md:text-[64px] lg:text-[80px]"
          >
            {copy.title_pre}{" "}
            <span className="italic text-vermilion">{copy.title_kr}</span>
            <br />
            {copy.title_post}
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-mid">
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

        {/* right: two smaller products. Upper one nudged down, lower
            one slightly larger and offset right — that asymmetry is
            what gives the collage its magazine feel. */}
        <div className="grid grid-cols-2 gap-3 md:col-span-3 md:col-start-10 md:row-span-2 md:row-start-1 md:grid-cols-1 md:gap-5">
          <div className="md:translate-y-6">
            <CollageTile url={small1} ratio="1/1" alt="" />
          </div>
          <div className="md:-translate-x-3">
            <CollageTile url={small2} ratio="3/4" alt="" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Single tile — handles missing URLs gracefully so the layout doesn't
// collapse if Sofia uploads two out of three images.
// ─────────────────────────────────────────────────────────────────────────

function CollageTile({
  url,
  ratio,
  alt,
}: {
  url: string;
  ratio: "4/5" | "1/1" | "3/4";
  alt: string;
}) {
  // Tailwind doesn't pick up arbitrary template-string classes — map the
  // ratio to a static class up front so JIT picks it up.
  const ratioClass =
    ratio === "4/5"
      ? "aspect-[4/5]"
      : ratio === "3/4"
        ? "aspect-[3/4]"
        : "aspect-square";

  if (!url) {
    return (
      <div
        className={`${ratioClass} flex w-full items-center justify-center border border-ink/10 bg-rice-dim/50 text-ink-mid`}
      >
        <ImageOff className="h-5 w-5 opacity-60" aria-hidden />
      </div>
    );
  }

  return (
    <div className={`${ratioClass} w-full overflow-hidden bg-rice-dim/50`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="h-full w-full object-cover"
        loading="eager"
        decoding="async"
      />
    </div>
  );
}
