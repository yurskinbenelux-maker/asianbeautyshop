// ─────────────────────────────────────────────────────────────────────────
// InstagramSection — curated 6-tile grid below the journal teaser on
// the homepage. Each tile is either:
//
//   1. An <iframe> embed of the live Instagram post (default — when
//      Sofia leaves imageUrl blank). Shows the real post content,
//      supports video playback inline, includes the "View on
//      Instagram" affordance to deep-link to the full post with
//      comments. No Meta dev account needed — the /embed/ URL is
//      public.
//
//   2. A custom image (when Sofia pastes an imageUrl). For times
//      she wants a branded thumbnail instead of the IG-native chrome.
//      Click still goes to the IG post.
//
// Self-hides when zero active tiles exist. iframes use loading="lazy"
// so only the visible row downloads — keeps the homepage LCP fast.
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import { Instagram } from "lucide-react";
import {
  instagramEmbedUrl,
  type InstagramPostCard,
} from "@/lib/queries/instagram";

export function InstagramSection({
  tiles,
  handle = "@yur_skin_cosmetics",
  profileUrl = "https://www.instagram.com/yur_skin_cosmetics/",
}: {
  tiles: InstagramPostCard[];
  /** Display handle shown next to the heading. */
  handle?: string;
  /** Where the heading link points (Sofia's IG profile). */
  profileUrl?: string;
}) {
  if (tiles.length === 0) return null;

  return (
    <section className="container py-16 md:py-24">
      <header className="mb-8 flex flex-col items-center text-center">
        <div className="text-[11px] uppercase tracking-label text-vermilion">
          Follow along
        </div>
        <h2 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          Join us on Instagram
        </h2>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
        >
          <Instagram className="h-3.5 w-3.5" aria-hidden />
          <span>{handle}</span>
        </a>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <InstagramTile key={tile.id} tile={tile} />
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border border-ink/15 bg-white/60 px-5 py-3 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:text-vermilion"
        >
          <Instagram className="h-3.5 w-3.5" aria-hidden />
          <span>Follow {handle}</span>
        </a>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Single tile. Three layout branches by priority:
//   1. Sofia uploaded a custom imageUrl  → render <Image> + overlay link
//   2. The postUrl parses cleanly        → render <iframe> embed
//   3. Neither works                     → render a "View on Instagram"
//      fallback so we never display a broken tile
// ─────────────────────────────────────────────────────────────────────────

function InstagramTile({ tile }: { tile: InstagramPostCard }) {
  const embedUrl = instagramEmbedUrl(tile.postUrl);
  const useImage = !!tile.imageUrl?.trim();

  // Branch 1: custom image override
  if (useImage) {
    return (
      <a
        href={tile.postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative aspect-square overflow-hidden bg-rice-dim"
        aria-label={
          tile.caption
            ? `${tile.caption} — open on Instagram`
            : "Open on Instagram"
        }
      >
        <Image
          src={tile.imageUrl as string}
          alt={tile.imageAlt ?? "Instagram post"}
          fill
          sizes="(min-width: 1024px) 16vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/0 transition-colors duration-300 group-hover:bg-ink/30"
          aria-hidden
        >
          <Instagram className="h-6 w-6 text-rice opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
        {tile.caption && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-3 py-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden
          >
            <p className="line-clamp-2 text-[11px] leading-snug text-rice">
              {tile.caption}
            </p>
          </div>
        )}
      </a>
    );
  }

  // Branch 2: live Instagram embed
  if (embedUrl) {
    return (
      <div className="relative aspect-square overflow-hidden bg-rice-dim">
        {/*
          The iframe handles its own click-to-play (videos) and
          click-to-view-on-Instagram (the chrome it ships with). Visitors
          who want comments tap "View on Instagram" inside the iframe.
          We constrain to aspect-square so the grid stays tidy — IG
          embeds scale gracefully; the caption strip below the post is
          cropped at the bottom.

          loading="lazy" defers the iframe download until the row
          enters the viewport. With 6 iframes that would otherwise
          torpedo LCP.
        */}
        <iframe
          src={embedUrl}
          loading="lazy"
          // Allow the embed to register clicks against instagram.com.
          // sandbox would block them; we keep it permissive.
          referrerPolicy="no-referrer-when-downgrade"
          title={tile.caption ?? "Instagram post"}
          className="absolute inset-0 h-full w-full border-0"
          allow="encrypted-media"
        />
      </div>
    );
  }

  // Branch 3: malformed URL — render a fallback link tile so the
  // section doesn't show an empty box. Sofia can fix the URL in
  // /admin/marketing/instagram and the tile auto-recovers.
  return (
    <a
      href={tile.postUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex aspect-square items-center justify-center bg-rice-dim text-ink-mid transition-colors hover:bg-rice hover:text-vermilion"
    >
      <Instagram className="h-8 w-8" aria-hidden />
    </a>
  );
}
