// ─────────────────────────────────────────────────────────────────────────
// MediaCard — one tile in the library grid. Click the image to open a
// detail drawer (below); the card itself shows essentials at a glance.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Crown,
  ExternalLink,
  ImageOff,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AdminMediaRow,
  MediaPickerJournalPost,
  MediaPickerProduct,
} from "@/lib/queries/admin-media";
import { MediaDrawer } from "./media-drawer";

export function MediaCard({
  media,
  pickerProducts,
  pickerJournalPosts,
}: {
  media: AdminMediaRow;
  pickerProducts: MediaPickerProduct[];
  pickerJournalPosts: MediaPickerJournalPost[];
}) {
  const [open, setOpen] = useState(false);
  const orphan = !media.productId && media.bannerCount === 0;

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col border bg-white/60 transition-colors",
          orphan
            ? "border-vermilion/20 hover:border-vermilion/40"
            : "border-ink/10 hover:border-ink/30",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative block aspect-square w-full overflow-hidden bg-rice/60"
        >
          {media.kind === "VIDEO" ? (
            // Videos preview inline, muted, looping, NOT autoplay (we
            // don't want a wall of videos all firing at once on the
            // grid). They start playing on hover via CSS-driven JS,
            // but the cheap solution: leave paused with a poster-less
            // first-frame so Sofia can still tell what's in it.
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={media.url}
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLVideoElement).play().catch(() => {});
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLVideoElement).pause();
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.url}
              alt={media.alt ?? ""}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          {media.kind === "VIDEO" && (
            <span
              className="absolute bottom-2 right-2 inline-flex items-center gap-1 border border-ink/30 bg-rice/90 px-1.5 py-0.5 text-[9px] uppercase tracking-label text-ink backdrop-blur"
              title="Video clip"
            >
              Video
            </span>
          )}
          {media.isPrimary && (
            <span
              title="Primary image"
              className="absolute left-2 top-2 inline-flex items-center gap-1 border border-gold/40 bg-gold/15 px-1.5 py-0.5 text-[9px] uppercase tracking-label text-gold backdrop-blur"
            >
              <Crown className="h-2.5 w-2.5" />
              Primary
            </span>
          )}
          {orphan && (
            <span
              title="Not linked to any product or banner"
              className="absolute right-2 top-2 inline-flex items-center gap-1 border border-vermilion/40 bg-vermilion/15 px-1.5 py-0.5 text-[9px] uppercase tracking-label text-vermilion backdrop-blur"
            >
              <ImageOff className="h-2.5 w-2.5" />
              Orphan
            </span>
          )}
        </button>

        <div className="flex flex-col gap-1 border-t border-ink/5 p-3">
          <p className="truncate text-[12px] text-ink">
            {media.alt || (
              <span className="italic text-ink-mid">No alt text</span>
            )}
          </p>
          {media.productId ? (
            <Link
              href={`/admin/products/${media.productId}`}
              className="inline-flex items-center gap-1 truncate text-[11px] text-ink-mid hover:text-ink"
            >
              <LinkIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{media.productName}</span>
              <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60" />
            </Link>
          ) : media.bannerCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-mid">
              <LinkIcon className="h-3 w-3" />
              On {media.bannerCount} banner{media.bannerCount === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-vermilion/80">
              Unused
            </span>
          )}
        </div>
      </div>

      {open && (
        <MediaDrawer
          media={media}
          pickerProducts={pickerProducts}
          pickerJournalPosts={pickerJournalPosts}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
