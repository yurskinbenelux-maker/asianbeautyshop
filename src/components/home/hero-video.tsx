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

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/routing";
import { ArrowRight } from "lucide-react";
import type { HeroCopy } from "./hero-moon-jar";

/** Fallback defaults if the admin hasn't dialled in custom timings.
 *  Matches the values the feature originally shipped with — long enough
 *  to read the headline, short enough that the visitor doesn't think
 *  the page is broken. The admin can now override these from
 *  /admin/homepage/hero. */
const DEFAULT_POSTER_HOLD_MS = 2500;
const DEFAULT_POSTER_FADE_MS = 700;

export function HeroVideo({
  copy,
  videoUrl,
  poster,
  objectPositionDesktop = "center",
  objectPositionMobile = "center",
  posterHoldMs = DEFAULT_POSTER_HOLD_MS,
  posterFadeMs = DEFAULT_POSTER_FADE_MS,
}: {
  copy: HeroCopy;
  videoUrl: string;
  poster?: string;
  /** Optional CSS object-position override for desktop / mobile. Lets an
   *  admin shift the visible crop of the cinematic video so what's
   *  perfect on PC (e.g. a face in the right third) stays visible on
   *  mobile (where the wider video gets cropped to a much taller
   *  letterbox). Both default to "center" — same crop the feature
   *  shipped with. */
  objectPositionDesktop?: string;
  objectPositionMobile?: string;
  /** Milliseconds the poster image stays at full opacity before the
   *  cross-fade begins. Admin-editable via /admin/homepage/hero (stored
   *  as decimal seconds, converted to ms at the wrapper). Default 2500. */
  posterHoldMs?: number;
  /** Milliseconds the poster → video opacity transition takes. Default 700. */
  posterFadeMs?: number;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  // Whether the poster overlay is still visible. Starts true when we
  // have BOTH a video AND a poster (so there's something to fade FROM
  // and TO). After POSTER_HOLD_MS we flip to false, the CSS transition
  // takes POSTER_FADE_MS to complete, and the video — which has been
  // playing underneath the whole time — is revealed.
  const showPoster = !!videoUrl && !!poster;
  const [posterVisible, setPosterVisible] = useState(showPoster);

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

  // Fade the poster overlay out after the hold window. We use a plain
  // setTimeout rather than waiting on `canplay`, because the visual
  // intent is "hold the still frame for N ms", not "hold until the
  // video can play" — the video has been buffering in the background
  // the whole time so it's ready well before the fade kicks in. The
  // cleanup clears the timer if the visitor navigates away mid-hold.
  useEffect(() => {
    if (!showPoster) return;
    // posterHoldMs of 0 = fade immediately on mount (effectively skips
    // the intro). setTimeout with 0 still fires on the next tick so the
    // initial render shows the poster for a frame — that's fine, browsers
    // need the paint to wire up the CSS transition.
    const t = window.setTimeout(
      () => setPosterVisible(false),
      Math.max(0, posterHoldMs),
    );
    return () => window.clearTimeout(t);
  }, [showPoster, posterHoldMs]);

  return (
    <section
      className="relative h-[80vh] min-h-[560px] w-full overflow-hidden bg-ink"
      aria-labelledby="hero-headline"
    >
      {/* Background layer 1: the actual hero video.
          Renders whenever videoUrl is set — even while the poster is
          overlaying on top — so by the time the poster fades the video
          is already playing in sync with its own timeline. The
          per-viewport object-position via two CSS custom properties
          (same pattern as the popups) covers desktop vs mobile crops. */}
      {videoUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={ref}
          className="absolute inset-0 h-full w-full object-cover [object-position:var(--yur-hero-vid-pos-mobile)] md:[object-position:var(--yur-hero-vid-pos-desktop)]"
          style={
            {
              "--yur-hero-vid-pos-desktop": objectPositionDesktop || "center",
              "--yur-hero-vid-pos-mobile": objectPositionMobile || "center",
            } as React.CSSProperties
          }
          src={videoUrl}
          // Drop the native poster attribute. We're rendering our own
          // poster <img> on top so we control the fade-out — the
          // browser's built-in poster has no transition.
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
      ) : !poster ? (
        // No video and no poster — solid ink gradient placeholder.
        <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink/85 to-ink/95" />
      ) : null}

      {/* Background layer 2: the poster image overlay.
          Two roles depending on what's configured:
            · Both video + poster:  intentional intro held for
              POSTER_HOLD_MS, then fades out over POSTER_FADE_MS to
              reveal the video underneath. Eliminates the brief
              poster→video flicker that reads as a glitch.
            · Poster only (no video):  static hero, no fade. Stays at
              opacity 1 forever.
          Either way the typography overlay (next block) stays visible
          throughout — it lives in its own absolute layer above this. */}
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          // F5: hero poster is the LCP candidate when the video isn't
          // ready yet. fetchpriority="high" + eager loading + decoding
          // async tells the browser to download this BEFORE non-critical
          // assets (analytics, fonts, below-the-fold images).
          loading="eager"
          decoding="async"
          fetchPriority="high"
          // Same object-position custom props as the video so the crop
          // matches exactly — the visitor doesn't notice the transition
          // because the framing is identical on both layers.
          className="absolute inset-0 h-full w-full object-cover [object-position:var(--yur-hero-vid-pos-mobile)] md:[object-position:var(--yur-hero-vid-pos-desktop)]"
          style={
            {
              "--yur-hero-vid-pos-desktop":
                objectPositionDesktop || "center",
              "--yur-hero-vid-pos-mobile":
                objectPositionMobile || "center",
              // Cross-fade — opacity drives the reveal. When the
              // image is the ONLY background (no video set), it
              // never fades; otherwise it fades on the timer above.
              opacity: showPoster ? (posterVisible ? 1 : 0) : 1,
              transition: `opacity ${Math.max(0, posterFadeMs)}ms ease-out`,
              // pointer-events:none so clicks pass through to anything
              // beneath the image during the brief fade window.
              pointerEvents: "none",
            } as React.CSSProperties
          }
          // Keep the image out of the accessibility tree once it's
          // faded — screen readers shouldn't keep announcing a
          // decorative hero image that's no longer visible.
          aria-hidden={showPoster && !posterVisible ? true : undefined}
        />
      )}

      {/* Dark gradient under the type so it stays legible regardless
          of what's in the footage. Stronger at the bottom-left where
          text lives, fading to transparent up + right. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-tr from-ink/75 via-ink/35 to-transparent"
      />

      {/* Copy column.
          During the poster intro we keep the headline + CTAs invisible so
          the title-card moment reads as pure cinema — just the still
          frame, no UI on top of it. The wrapper fades in on the same
          timeline as the poster fade-out, with a touch of delay so the
          text resolves *after* the video has started showing through.
          When there's no poster intro (showPoster === false) the type is
          always visible from first paint, same as before. */}
      <div
        className="relative flex h-full flex-col justify-end pb-16 md:pb-24"
        style={{
          opacity: showPoster && posterVisible ? 0 : 1,
          // Same duration as the poster fade, slight delay so the text
          // doesn't race the poster — feels like the type "arrives"
          // along with the video underneath rather than crossfading
          // simultaneously. Delay is half the fade duration, capped.
          transition: `opacity ${Math.max(0, posterFadeMs)}ms ease-out ${Math.round(Math.max(0, posterFadeMs) / 2)}ms`,
        }}
        // Don't let assistive tech or clicks land on the hidden CTAs
        // while the poster is still occluding everything.
        aria-hidden={showPoster && posterVisible ? true : undefined}
      >
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
