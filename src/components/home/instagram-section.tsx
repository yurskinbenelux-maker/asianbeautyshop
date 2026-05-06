// ─────────────────────────────────────────────────────────────────────────
// InstagramSection — curated polaroid wall below the journal teaser.
//
// Pattern reference: every premium beauty site (Glossier, Drunk
// Elephant, Tatcha, Selfridges, koreanskincare.be) does this the same
// way — a tight grid of branded image tiles that link out to the IG
// profile / specific post. NOT live IG embeds — those import the IG
// chrome (View profile pill, like/save buttons, "Add a comment" box)
// which always reads as a stranded social embed instead of a
// considered editorial moment.
//
// Layout:
//   · Mobile: 2 cols (3:4 portrait tiles)
//   · Desktop: 3 cols × 2 rows = 6 tiles
//   · Hover: gentle zoom + dark wash + IG glyph + caption fade-in
//
// Tiles without an imageUrl are filtered out at the query layer, so
// the section only ever renders complete tiles. The section
// self-hides when zero complete tiles exist.
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import { ArrowUpRight, Instagram } from "lucide-react";
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
  // Only show tiles that actually have an image — the live-embed mode
  // produced bad-looking tiles, so we no longer ship without an image.
  const visibleTiles = tiles
    .filter((t) => !!t.imageUrl?.trim())
    .slice(0, 6);

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
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </a>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Single tile — server-rendered image with hover affordances. Click
// opens the actual Instagram post in a new tab so the social proof
// loop closes (visitor sees the post → taps through → likes/follows
// from inside IG, where the conversion happens).
// ─────────────────────────────────────────────────────────────────────────

function InstagramTile({ tile }: { tile: InstagramPostCard }) {
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
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
      />
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
