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

export async function HomepageVideoReel() {
  const cfg = await readHomeVideoSettings();
  if (cfg.mode === "off") return null;

  // Defensive: if mode is set but no URLs are populated, hide the section
  // rather than render an empty black rectangle.
  const usableUrls = cfg.urls.filter((u) => u.trim().length > 0);
  if (usableUrls.length === 0) return null;

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
          <video
            // eslint-disable-next-line jsx-a11y/media-has-caption
            className="h-full w-full object-cover"
            src={cfg.urls[0]}
            poster={cfg.poster || undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        </div>
      ) : (
        // Trio — three 9:16 cards side by side on desktop, stacked on
        // mobile with a generous gap.
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-5">
          {[0, 1, 2].map((i) => {
            const url = cfg.urls[i] ?? "";
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
                    poster={cfg.poster || undefined}
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
