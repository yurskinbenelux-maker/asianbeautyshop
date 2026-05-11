// ─────────────────────────────────────────────────────────────────────────
// Hero V — Cinematic Video.
//
// Full-bleed muted-loop mp4 fills the viewport, a soft ink → transparent
// gradient anchors the lower-left where the typography sits.
//
// Why this is a client component:
//   Browsers occasionally refuse to honour the `autoplay` attribute
//   even when `muted` + `playsInline` are set — most often when the
//   visitor has data-saver enabled, when the tab loaded in the
//   background, or with certain macOS/iOS quirks. We add a small
//   `.play()` retry on mount as a fallback so the hero almost
//   always animates instead of freezing on the first frame.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef } from "react";
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
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Defensive .play() — covers edge cases where the autoplay attribute
    // alone isn't enough (data-saver, low-power mode, background tab).
    // The promise rejects silently if the browser still refuses; the
    // poster image stays visible in that case.
    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          // ignore — browser policy refused autoplay
        });
      }
    };
    if (v.readyState >= 2) {
      tryPlay();
    } else {
      v.addEventListener("loadeddata", tryPlay, { once: true });
      return () => v.removeEventListener("loadeddata", tryPlay);
    }
  }, [videoUrl]);

  return (
    <section
      className="relative h-[80vh] min-h-[560px] w-full overflow-hidden bg-ink"
      aria-labelledby="hero-headline"
    >
      {videoUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={ref}
          className="absolute inset-0 h-full w-full object-cover"
          src={videoUrl}
          poster={poster || undefined}
          autoPlay
          muted
          loop
          playsInline
          // `auto` tells the browser to download the whole file eagerly
          // instead of pausing after the metadata. Hero videos should
          // play without delay — bandwidth cost is justified.
          preload="auto"
          // Disable the native macOS/iOS picture-in-picture promotion
          // so the video stays in the page where we want it.
          disablePictureInPicture
          // Suppress remote-playback (AirPlay) controls — they have a
          // habit of pausing the video when the visitor's Apple TV
          // wakes up nearby.
          disableRemotePlayback
        />
      ) : poster ? (
        // F5: hero poster is the LCP candidate when the video isn't
        // ready yet. fetchpriority="high" + eager loading + decoding
        // async tells the browser to download this BEFORE non-critical
        // assets (analytics, fonts, below-the-fold images).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink/85 to-ink/95" />
      )}

      {/* Dark gradient under the type so it stays legible regardless
          of what's in the footage. Stronger at the bottom-left where
          text lives, fading to transparent up + right. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-tr from-ink/75 via-ink/35 to-transparent"
      />

      {/* Copy column */}
      <div className="relative flex h-full flex-col justify-end pb-16 md:pb-24">
        <div className="container max-w-3xl">
          <div className="text-[11px] uppercase tracking-label text-rice/70">
            {copy.eyebrow}
          </div>
          <h1
            id="hero-headline"
            // Mobile uses looser leading (1.08) so a wrapped headline +
            // the Korean character below it has breathing room and
            // descenders don't kiss the next line. Tightens to 0.95 on
            // desktop where the type sets in single lines.
            className="mt-3 font-display text-[44px] leading-[1.08] text-rice sm:text-[56px] sm:leading-[1.02] md:text-[88px] md:leading-[0.95] lg:text-[112px]"
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
