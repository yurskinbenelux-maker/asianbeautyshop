// ─────────────────────────────────────────────────────────────────────────
// Hero V — Cinematic Video.
//
// Full-bleed muted-loop mp4 fills the viewport, a soft ink → transparent
// gradient anchors the lower-left where the typography sits. Same copy
// shape as HeroMoonJar so the SiteCopy overrides flow through unchanged.
//
// Server component — autoplay/muted/loop/playsInline are pure HTML
// attributes, no client JS. Falls back to a poster image when the
// browser disables autoplay (low-power mode, data saver).
// ─────────────────────────────────────────────────────────────────────────

import { Link } from "@/i18n/routing";
import { ArrowRight } from "lucide-react";
import type { HeroCopy } from "./hero-moon-jar";

export function HeroVideo({
  copy,
  videoUrl,
  poster,
}: {
  copy: HeroCopy;
  videoUrl: string;
  poster?: string;
}) {
  return (
    <section
      className="relative h-[80vh] min-h-[560px] w-full overflow-hidden bg-ink"
      aria-labelledby="hero-headline"
    >
      {/* video layer */}
      {videoUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={videoUrl}
          poster={poster || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink/85 to-ink/95" />
      )}

      {/* dark gradient under the type so it stays legible regardless of
          what's in the footage. Stronger at the bottom-left where text
          lives, fading to transparent up + right where the video reads
          cleanly. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-tr from-ink/75 via-ink/35 to-transparent"
      />

      {/* copy column */}
      <div className="relative flex h-full flex-col justify-end pb-16 md:pb-24">
        <div className="container max-w-3xl">
          <div className="text-[11px] uppercase tracking-label text-rice/70">
            {copy.eyebrow}
          </div>
          <h1
            id="hero-headline"
            className="mt-3 font-display text-display-md leading-[0.95] text-rice md:text-[88px] lg:text-[112px]"
          >
            {copy.title_pre}{" "}
            <span className="italic text-vermilion/90">{copy.title_kr}</span>
            <br />
            {copy.title_post}
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-rice/80 md:text-[16px]">
            {copy.lede}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link
              href="/shop"
              className="group inline-flex items-center gap-3 bg-rice px-7 py-3 text-[12px] uppercase tracking-label text-ink transition-colors hover:bg-vermilion hover:text-rice"
            >
              {copy.cta_primary}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/quiz"
              className="inline-flex items-center text-[12px] uppercase tracking-label text-rice/80 underline-offset-4 transition-colors hover:text-rice hover:underline"
            >
              {copy.cta_secondary}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
