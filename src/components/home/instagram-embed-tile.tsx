// ─────────────────────────────────────────────────────────────────────────
// InstagramEmbedTile — client component that renders a single Instagram
// post using Meta's OFFICIAL embed.js script.
//
// Why this exists:
//   The simple `<iframe src=".../embed/">` approach gets blocked in
//   production by X-Frame-Options ("refused to connect"). The
//   script-based approach is what Meta actually supports — render a
//   <blockquote class="instagram-media"> with the permalink, then
//   call window.instgrm.Embeds.process() and the script swaps in a
//   properly-authorised iframe pointing at the post.
//
// Sizing notes:
//   IG's widget refuses to render gracefully below ~326px wide; below
//   that the chrome eats most of the box. We let the parent constrain
//   to 326-400px and let the embed take its natural height. A subtle
//   ink-toned frame wraps it so it visually belongs on the page
//   instead of looking like a stray social embed.
//
// States:
//   pending  → soft skeleton while embed.js is loading + processing
//   ready    → IG iframe present (fades in)
//   failed   → 6s timeout reached → fallback "View on Instagram" link
//              so visitors are never stranded on an empty box.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState } from "react";
import { Instagram } from "lucide-react";

declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process: () => void;
      };
    };
  }
}

export function InstagramEmbedTile({
  postUrl,
  caption,
}: {
  postUrl: string;
  caption?: string | null;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"pending" | "processed" | "failed">(
    "pending",
  );

  useEffect(() => {
    const tryProcess = () => {
      if (typeof window === "undefined") return;
      window.instgrm?.Embeds?.process?.();
    };
    tryProcess();

    let cancelled = false;
    const start = Date.now();
    const tick = () => {
      if (cancelled) return;
      if (ref.current?.querySelector("iframe")) {
        setState("processed");
        return;
      }
      if (Date.now() - start > 6000) {
        setState("failed");
        return;
      }
      tryProcess();
      setTimeout(tick, 250);
    };
    const t = setTimeout(tick, 200);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [postUrl]);

  return (
    <div
      ref={ref}
      // Frame around the embed: subtle border, soft cream background,
      // sits flush in the grid. min-height keeps the box visible
      // while the embed loads so the layout doesn't jump.
      className="relative min-h-[420px] w-full overflow-hidden border border-ink/10 bg-white"
    >
      {/*
        IG's script reads the data attributes off this blockquote and
        replaces it with an authorised iframe. The custom CSS strips
        IG's default padding/margins/borders so it lays flush in our
        frame. Width is forced to 100% so the iframe fills the column.
      */}
      <blockquote
        className="instagram-media !m-0 !w-full !min-w-0 !max-w-full !border-0 !bg-transparent !p-0 !shadow-none"
        data-instgrm-permalink={postUrl}
        data-instgrm-version="14"
        style={{
          margin: 0,
          padding: 0,
          background: "transparent",
          border: 0,
          maxWidth: "100%",
          minWidth: 0,
          width: "100%",
        }}
      />

      {state === "pending" && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-rice-dim"
          aria-hidden
        >
          <Instagram className="h-6 w-6 animate-pulse text-ink/30" />
          <div className="text-[10px] uppercase tracking-label text-ink-mid">
            Loading post…
          </div>
        </div>
      )}

      {state === "failed" && (
        <a
          href={postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-rice-dim text-ink-mid transition-colors hover:bg-rice hover:text-vermilion"
          aria-label={
            caption ? `${caption} — open on Instagram` : "Open on Instagram"
          }
        >
          <Instagram className="h-8 w-8" aria-hidden />
          <span className="text-[10px] uppercase tracking-label">
            View on Instagram
          </span>
        </a>
      )}
    </div>
  );
}
