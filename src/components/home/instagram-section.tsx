// ─────────────────────────────────────────────────────────────────────────
// InstagramSection — curated 6-tile grid below the journal teaser on
// the homepage. Each tile is one of:
//
//   1. A custom image (when Sofia pastes an `imageUrl` override) —
//      server-rendered <Image>. Click goes to the IG post.
//
//   2. A live Instagram embed (default — when imageUrl is blank).
//      Rendered via Meta's official embed.js script which converts
//      <blockquote class="instagram-media"> nodes into authorised
//      iframes (works around X-Frame-Options on the bare /embed/
//      iframe URL — that approach gets blocked in production).
//      See `instagram-embed-tile.tsx` for the client component.
//
// We load embed.js once at the section root via next/script so all
// six tiles share the same loader. Self-hides when zero active tiles.
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import Script from "next/script";
import { Instagram } from "lucide-react";
import { InstagramEmbedTile } from "@/components/home/instagram-embed-tile";
import { type InstagramPostCard } from "@/lib/queries/instagram";

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

  // Only inject embed.js when at least one tile actually needs it (i.e.
  // some tile lacks an imageUrl override). Avoids loading 30kb of
  // Instagram script for grids that are 100% custom images.
  const needsScript = tiles.some((t) => !t.imageUrl?.trim());

  return (
    <section className="container py-16 md:py-24">
      {needsScript && (
        <Script
          src="https://www.instagram.com/embed.js"
          strategy="afterInteractive"
          // After the script loads, kick the processor once. Each
          // <InstagramEmbedTile> also calls process() on mount, but
          // this is the first-paint trigger for tiles already mounted.
          onLoad={() => {
            if (typeof window !== "undefined") {
              window.instgrm?.Embeds?.process?.();
            }
          }}
        />
      )}

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
// Per-tile dispatcher. Image override = server <Image>; otherwise hand
// off to the client embed component (which loads the IG script + swaps
// in a real iframe).
// ─────────────────────────────────────────────────────────────────────────

function InstagramTile({ tile }: { tile: InstagramPostCard }) {
  const useImage = !!tile.imageUrl?.trim();

  // Branch 1: custom image override (server-rendered, fast)
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

  // Branch 2: live Instagram embed via official script
  return <InstagramEmbedTile postUrl={tile.postUrl} caption={tile.caption} />;
}
