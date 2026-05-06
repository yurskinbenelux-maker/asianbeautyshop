// ─────────────────────────────────────────────────────────────────────────
// InstagramSection — curated 6-tile grid below the journal teaser on
// the homepage. Each tile is a square image linked to a real
// Instagram post (opens in a new tab). Sofia curates the list from
// /admin/marketing/instagram.
//
// The section self-hides when zero active posts exist, so a fresh
// install (or a deliberately-paused state) doesn't render a sad empty
// rail. Server component — pure server-side render with next/image
// optimisation.
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import { Instagram } from "lucide-react";
import type { InstagramPostCard } from "@/lib/queries/instagram";

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
      {/* ── Header — eyebrow + display heading + IG handle ────── */}
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

      {/* ── Tile grid ─────────────────────────────────────────────
          2-up on phones, 3-up on tablets, 6-up on wide desktops.
          Square aspect ratio matches the IG feed convention so the
          section reads as "an Instagram grid" at a glance. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <a
            key={tile.id}
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
              src={tile.imageUrl}
              alt={tile.imageAlt ?? "Instagram post"}
              fill
              sizes="(min-width: 1024px) 16vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />

            {/* Hover veil + IG glyph — subtle "this is clickable, leads
                to Instagram" cue. Hidden until hover so the grid reads
                as pure imagery at rest. Also visible on mobile because
                hover states don't fire on touch — the small glyph in
                the corner is enough to telegraph the affordance. */}
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/0 transition-colors duration-300 group-hover:bg-ink/30"
              aria-hidden
            >
              <Instagram className="h-6 w-6 text-rice opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>

            {/* Optional caption overlay — only shown if Sofia set one
                and only on hover. Bottom strip, two-line clamp. */}
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
        ))}
      </div>

      {/* ── Closing CTA — quiet "see more on Instagram" link. */}
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
