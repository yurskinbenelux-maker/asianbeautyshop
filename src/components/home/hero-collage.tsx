// ─────────────────────────────────────────────────────────────────────────
// Hero C — Color Block Showcase.
//
// Asymmetric 58/42 split:
//   · Left (cream / `bg-rice`) holds the type column — eyebrow rule,
//     italicised editorial headline, italic lede, CTAs.
//   · Right (vermilion saturated brand color) is the gallery wall, with
//     a single hero product photograph framed as an inset cream card.
//     "N°01" floats top-left in cream italic for editorial cachet, a
//     small "Look 01 · Cushion" caption pins to the bottom-right.
//
// We frame the product photo in a cream card (rather than masking it
// circular) so any rectangular photo Sofia uploads — even ones shot on
// a white-paper background — lands cleanly on the vermilion. The
// vermilion is the brand wall; the card is the artwork.
//
// Section height is bounded — `min-h-[520px] md:min-h-[600px]` so it
// never sprawls past one viewport, leaving room for the video reel and
// bestsellers strip immediately below.
//
// We re-use `imageUrls[0]` as the hero. The other two slots are kept
// in the schema for forward-compat (a future variant might want them)
// but ignored here — the admin form already labels slot 1 as the hero
// product.
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
  const heroImage = imageUrls[0];

  return (
    <section
      className="relative overflow-hidden bg-rice"
      aria-labelledby="hero-headline"
    >
      <div className="grid min-h-[520px] grid-cols-12 md:min-h-[600px]">
        {/* ── Cream side — type column ──────────────────────────── */}
        <div className="relative col-span-12 flex flex-col justify-center bg-rice px-6 py-14 md:col-span-7 md:px-12 md:py-16 lg:px-20 lg:py-20">
          {/* Subtle radial glow + a single petal at the edge for
              brand continuity with the typography hero. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_30%_30%,rgba(232,171,127,0.12),transparent_70%)]"
          />
          <span
            aria-hidden
            className="absolute right-[8%] top-[14%] h-1.5 w-1.5 rounded-full bg-vermilion/40"
          />

          <div className="relative">
            {/* Magazine kicker — vermilion rule + eyebrow */}
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-px w-10 bg-vermilion" />
              <span className="text-[11px] uppercase tracking-label text-ink-mid">
                {copy.eyebrow}
              </span>
            </div>

            <h1
              id="hero-headline"
              className="mt-6 font-display text-display-md leading-[0.96] text-ink md:text-[56px] lg:text-[72px]"
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

        {/* ── Vermilion side — product showcase ───────────────────
            Saturated brand-color "gallery wall". The cream card inside
            holds the product photograph, framed and centered. Editorial
            cues — N°01 italic top-left, hairline + caption bottom-right
            — turn what could be a flat colored panel into a styled
            spread. ──────────────────────────────────────────────── */}
        <div className="relative col-span-12 flex items-center justify-center bg-vermilion p-8 md:col-span-5 md:p-12">
          {/* N°01 — editorial signpost */}
          <div className="absolute left-6 top-6 font-display text-[15px] italic text-rice/85 md:left-8 md:top-8 md:text-[16px]">
            N°01
          </div>

          {/* Product card — cream-backed frame so any product photo
              (even one shot on white) reads cleanly against the
              vermilion. Aspect ratio is square for visual stability. */}
          <figure className="relative w-full max-w-[340px]">
            <div className="relative aspect-square overflow-hidden bg-rice shadow-[0_24px_60px_-20px_rgba(26,26,26,0.4)]">
              {heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroImage}
                  alt=""
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-vermilion/50">
                  <ImageOff className="h-8 w-8" aria-hidden />
                </div>
              )}
            </div>
          </figure>

          {/* Bottom-right caption — hairline rule + small caps for the
              fashion-spread feel. */}
          <div className="absolute bottom-6 right-6 flex items-center gap-2 text-[10px] uppercase tracking-label text-rice/85 md:bottom-8 md:right-8">
            <span aria-hidden className="h-px w-4 bg-rice/50" />
            Look 01
          </div>
        </div>
      </div>
    </section>
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
