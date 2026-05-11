// ─────────────────────────────────────────────────────────────────────────
// InstagramSection — auto-pulled polaroid wall below the journal teaser.
//
// Source of data: the InstagramPost cache table, populated by the
// Graph API sync (cron-driven, see lib/instagram/sync.ts). When the
// cache is empty (token not configured yet, or first sync hasn't
// fired) the section self-hides. NOTHING is required from an admin at
// the post level — adding/removing posts on Instagram and waiting for
// the next sync is the entire workflow.
//
// Layout:
//   · Mobile: 2 cols (4:5 portrait tiles)
//   · Desktop: 3 cols × 2 rows = 6 tiles
//   · Hover: gentle zoom + dark wash + IG glyph + caption fade-in
//   · Video posts get a play-button overlay since they're poster-frame only
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import { ArrowUpRight, Instagram, Play } from "lucide-react";
import {
  isVideoPost,
  thumbnailFor,
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
  /** Where the heading link points (an admin's IG profile). */
  profileUrl?: string;
}) {
  const visibleTiles = tiles.slice(0, 6);
  if (visibleTiles.length === 0) return null;

  return (
    <section className="container py-16 md:py-24">
      <header className="mb-10 flex flex-col items-center text-center md:mb-12">
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {visibleTiles.map((tile) => (
          <InstagramTile key={tile.id} tile={tile} />
        ))}
      </div>

      <div className="mt-10 flex justify-center md:mt-12">
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 border border-ink/15 bg-white/60 px-6 py-3 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:text-vermilion"
        >
          <Instagram className="h-3.5 w-3.5" aria-hidden />
          <span>Follow {handle}</span>
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden
          />
        </a>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Single tile. Server-rendered <Image> using the right URL for the
// post's media type (image direct, video → poster frame). Click
// opens the actual Instagram post in a new tab.
// ─────────────────────────────────────────────────────────────────────────

function InstagramTile({ tile }: { tile: InstagramPostCard }) {
  const src = thumbnailFor(tile);
  const isVideo = isVideoPost(tile);
  const altText = tile.caption?.slice(0, 120) ?? "Instagram post";

  return (
    <a
      href={tile.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative aspect-[4/5] w-full overflow-hidden bg-rice-dim"
      aria-label={
        tile.caption
          ? `${tile.caption.slice(0, 80)} — open on Instagram`
          : "Open on Instagram"
      }
    >
      <Image
        src={src}
        alt={altText}
        fill
        sizes="(min-width: 768px) 33vw, 50vw"
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        // IG CDN URLs rotate, so we don't pre-build / SSG these.
        unoptimized
      />

      {/* Video play indicator — always visible on video posts, not just hover */}
      {isVideo && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Play className="h-5 w-5 fill-white text-white" />
          </div>
        </div>
      )}

      {/* Soft top-down gradient on hover keeps the IG glyph + caption legible */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/0 to-ink/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
      />

      {/* IG glyph in the corner — confirms "this is an Instagram post" */}
      <div
        className="pointer-events-none absolute right-3 top-3 flex h-9 w-9 items-center justify-center bg-white/0 text-rice opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:bg-white/15 group-hover:opacity-100"
        aria-hidden
      >
        <Instagram className="h-4 w-4" />
      </div>

      {/* Caption fade-in at the bottom on hover */}
      {tile.caption && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-4 pt-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
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
