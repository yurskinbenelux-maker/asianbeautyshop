// ─────────────────────────────────────────────────────────────────────────
// InstagramSection — curated grid below the journal teaser. Two layout
// modes pick themselves automatically based on what Sofia has added:
//
//   1. ALL tiles have a custom imageUrl → tight 6-up "polaroid wall"
//      (aspect-[4/5] portraits in a 3×2 grid). This is the
//      recommended look — fast, on-brand, no IG chrome.
//
//   2. ANY tile is a live embed → 3-up grid with bigger tiles. IG's
//      widget needs ≥326px width to render properly; cramming it
//      into a 6-column grid produces the squashed mess we had
//      before. Each embed sits in a 380-450px-wide column with its
//      natural height.
//
// Self-hides when there are zero active tiles. Loads embed.js only
// when at least one embed tile exists (saves ~30kb otherwise).
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import Script from "next/script";
import { ArrowUpRight, Instagram } from "lucide-react";
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

  // Embed mode = at least one tile lacks an imageUrl override. We
  // need the bigger 3-up layout for these to render properly.
  const hasEmbed = tiles.some((t) => !t.imageUrl?.trim());
  // Cap the visible count — six is plenty for a homepage section
  // and keeps the page light.
  const visibleTiles = tiles.slice(0, hasEmbed ? 3 : 6);

  return (
    <section className="container py-16 md:py-24">
      {hasEmbed && (
        // No onLoad callback — server components in Next 15 can't
        // pass function props to client components (Script is one).
        // Each <InstagramEmbedTile> polls for window.instgrm itself,
        // so the script just needs to load; the tiles take it from there.
        <Script
          src="https://www.instagram.com/embed.js"
          strategy="afterInteractive"
        />
      )}

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

      {/*
        Two grid presets. Embed mode = 1/2/3 cols, taller tiles, capped
        section width so single-tile layouts don't sprawl. Image mode =
        2/3 cols × portrait 4:5 tiles for the classic polaroid wall.
      */}
      <div
        className={
          hasEmbed
            ? "mx-auto grid max-w-5xl grid-cols-1 justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-3"
            : "grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4"
        }
      >
        {visibleTiles.map((tile) => (
          <InstagramTile key={tile.id} tile={tile} />
        ))}
      </div>

      <div className="mt-10 flex justify-center md:mt-12">
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border border-ink/15 bg-white/60 px-6 py-3 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:text-vermilion"
        >
          <Instagram className="h-3.5 w-3.5" aria-hidden />
          <span>Follow {handle}</span>
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Per-tile dispatcher. Image override = server <Image> (clean,
// branded, fast). Otherwise hand off to the client embed component.
// ─────────────────────────────────────────────────────────────────────────

function InstagramTile({ tile }: { tile: InstagramPostCard }) {
  const useImage = !!tile.imageUrl?.trim();

  if (useImage) {
    return (
      <a
        href={tile.postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative aspect-[4/5] w-full overflow-hidden bg-rice-dim"
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
          sizes="(min-width: 768px) 33vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Subtle dark wash on hover so the icon stays legible */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden
        />
        {/* IG glyph in the corner — confirms this is an Instagram tile */}
        <div
          className="pointer-events-none absolute right-3 top-3 flex h-8 w-8 items-center justify-center bg-white/0 text-rice opacity-0 transition-all duration-300 group-hover:bg-white/15 group-hover:opacity-100"
          aria-hidden
        >
          <Instagram className="h-4 w-4" />
        </div>
        {tile.caption && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent px-4 pb-4 pt-8 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
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

  // Live embed — taller column, IG widget gets its native height
  return (
    <div className="w-full max-w-[400px]">
      <InstagramEmbedTile postUrl={tile.postUrl} caption={tile.caption} />
    </div>
  );
}
