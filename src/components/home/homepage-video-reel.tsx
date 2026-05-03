// ─────────────────────────────────────────────────────────────────────────
// HomepageVideoReel — editorial video section between the type hero and
// the bestsellers strip.
//
// Three modes set in admin:
//   · "off"    → renders nothing (component returns null)
//   · "single" → one 16:9 mp4, contained max-w 7xl, autoplay muted loop
//   · "trio"   → three 9:16 portrait mp4s in a row with gaps; stacks on
//                mobile. Slots without a URL render a soft placeholder so
//                Sofia can launch with one or two videos and add more
//                later without the layout breaking.
//
// Server component — the autoplay/loop/muted are pure HTML attributes,
// no client JS needed. We deliberately set `playsinline` so iOS doesn't
// blow the videos out into fullscreen on tap.
// ─────────────────────────────────────────────────────────────────────────

import { readHomeVideoSettings } from "@/lib/queries/home-video";

/**
 * Coerce + trim defensively. The query layer already returns strings,
 * but this component runs at request time on every homepage hit and a
 * server-component crash here takes the whole page down — belt-and-
 * braces is cheap.
 */
function safeUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim();
}

export async function HomepageVideoReel() {
  const cfg = await readHomeVideoSettings();
  if (cfg.mode === "off") return null;

  // Normalise every URL slot up front so we never call .trim() on
  // something non-string downstream. Also strips whitespace-only entries.
  const cleanUrls = [
    safeUrl(cfg.urls[0]),
    safeUrl(cfg.urls[1]),
    safeUrl(cfg.urls[2]),
  ];
  const usableUrls = cleanUrls.filter((u) => u.length > 0);
  if (usableUrls.length === 0) return null;

  const poster = safeUrl(cfg.poster);

  return (
    <section className="container mt-24 md:mt-32" aria-label="Video reel">
      {(cfg.eyebrow || cfg.headline) && (
        <header className="mb-10 max-w-2xl">
          {cfg.eyebrow && (
            <div className="eyebrow">{cfg.eyebrow}</div>
          )}
          {cfg.headline && (
            <h2 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
              {cfg.headline}
            </h2>
          )}
        </header>
      )}

      {cfg.mode === "single" ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink/5">
          {cleanUrls[0] && (
            <video
              // eslint-disable-next-line jsx-a11y/media-has-caption
              className="h-full w-full object-cover"
              src={cleanUrls[0]}
              poster={poster || undefined}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          )}
        </div>
      ) : (
        // Trio — three 9:16 cards side by side at every breakpoint. The
        // gap shrinks on small screens so each reel keeps a usable size
        // (~110 px wide on a 360 px phone) while the IG-style triptych
        // aesthetic survives. Same source video works on every viewport;
        // the browser scales 1080×1920 down without re-encoding.
        <ul className="grid grid-cols-3 gap-2 md:gap-5">
          {[0, 1, 2].map((i) => {
            const url = cleanUrls[i] ?? "";
            return (
              <li
                key={i}
                className="relative aspect-[9/16] overflow-hidden bg-ink/5"
              >
                {url ? (
                  <video
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    className="h-full w-full object-cover"
                    src={url}
                    poster={poster || undefined}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-label text-ink-mid">
                    Reel {i + 1}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
