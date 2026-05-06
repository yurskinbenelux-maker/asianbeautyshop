// ─────────────────────────────────────────────────────────────────────────
// InstagramEmbedTile — client component that renders a single Instagram
// post using Meta's OFFICIAL embed.js script.
//
// Why this exists:
//   We tried the simpler `<iframe src=".../embed/">` approach first and
//   Instagram blocked it via X-Frame-Options ("refused to connect").
//   The script-based approach is the one Meta actually supports — you
//   render a <blockquote class="instagram-media"> with the permalink,
//   then call window.instgrm.Embeds.process() and the script swaps in
//   a properly-authorised iframe pointing at the post.
//
// Implementation notes:
//   · The script is loaded once per page via Next.js <Script> with
//     strategy="afterInteractive" and re-processing is triggered every
//     time this component mounts (tiles can mount async if the section
//     is gated by a feature flag, etc.).
//   · We render the blockquote with `data-instgrm-captioned` OFF (we
//     want the post itself, no caption strip) and a fixed visual frame
//     so the layout never jumps while the script swaps the iframe in.
//   · While the embed is processing, we show a soft skeleton so the
//     grid never has empty boxes mid-paint.
//   · If the script fails to inject (offline, blocked extension, etc.)
//     after 6s we hide the skeleton and fall back to a "View on
//     Instagram" link so visitors are never stranded on an empty tile.
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
  // Three states: 'pending' (script not loaded yet), 'processed' (the
  // blockquote has been swapped to a real iframe), 'failed' (timeout —
  // show fallback link).
  const [state, setState] = useState<"pending" | "processed" | "failed">(
    "pending",
  );

  useEffect(() => {
    // Kick the global processor — this is idempotent so it's fine to
    // call on every mount. If the script hasn't loaded yet, we'll retry
    // below in the polling loop.
    const tryProcess = () => {
      if (typeof window === "undefined") return;
      window.instgrm?.Embeds?.process?.();
    };
    tryProcess();

    // The processor runs async. Watch the host node for the iframe
    // Instagram injects — once it's there, switch off the skeleton.
    let cancelled = false;
    const start = Date.now();
    const tick = () => {
      if (cancelled) return;
      if (ref.current?.querySelector("iframe")) {
        setState("processed");
        return;
      }
      if (Date.now() - start > 6000) {
        // Six seconds is generous — if Instagram's script hasn't
        // produced an iframe by now it's not coming. Fall back so
        // visitors at least get a link to the post.
        setState("failed");
        return;
      }
      // Re-poke the processor every 750ms in case embed.js loaded
      // after our initial call. Cheap operation, idempotent.
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
      className="relative aspect-square overflow-hidden bg-rice-dim"
    >
      {/*
        The blockquote Instagram's embed.js looks for. The script
        swaps this with an authorised iframe in-place. We hide it via
        a wrapper rather than `display:none` so the script can still
        find and process the node.
      */}
      <blockquote
        className="instagram-media absolute inset-0 !m-0 !min-w-0 !w-full !max-w-full !border-0 !bg-transparent !p-0 !shadow-none [&_iframe]:!h-full [&_iframe]:!w-full [&_iframe]:!min-w-0 [&_iframe]:!max-w-full"
        data-instgrm-permalink={postUrl}
        data-instgrm-version="14"
        style={{
          // The script reads these inline on first paint to size the
          // injected iframe. Keep them tight so layout stays square.
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
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-rice-dim"
          aria-hidden
        >
          <div className="h-6 w-6 animate-pulse rounded-full bg-ink/15" />
        </div>
      )}

      {state === "failed" && (
        <a
          href={postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-rice-dim text-ink-mid transition-colors hover:bg-rice hover:text-vermilion"
          aria-label={
            caption ? `${caption} — open on Instagram` : "Open on Instagram"
          }
        >
          <Instagram className="h-7 w-7" aria-hidden />
          <span className="text-[10px] uppercase tracking-label">
            View on Instagram
          </span>
        </a>
      )}
    </div>
  );
}
