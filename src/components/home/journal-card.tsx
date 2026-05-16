// ─────────────────────────────────────────────────────────────────────────
// JournalCard — client wrapper so we can use Framer Motion + whileInView
// for a gentle reveal. The parent server component hands us the data it
// pulled from the DB (real post) or from the editorial fallback.
//
// Accepts either a coverUrl (real post) or a gradient class list
// (placeholder card). The reveal animation is skipped automatically when
// the user has `prefers-reduced-motion: reduce` thanks to our app-wide
// MotionConfig (see src/components/motion/motion-provider.tsx).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { motion } from "framer-motion";
import { Link } from "@/i18n/routing";

type Props = {
  index: number;
  href: string;
  coverUrl?: string | null;
  /** CSS object-position values from the admin's focal-point picker.
   *  Default null → component uses "center". Per-viewport CSS custom
   *  properties + Tailwind md: variant swap between mobile/desktop. */
  coverObjectPositionDesktop?: string | null;
  coverObjectPositionMobile?: string | null;
  gradient?: string;
  eyebrow: string;
  title: string;
  subline: string;
};

export function JournalCard({
  index,
  href,
  coverUrl,
  coverObjectPositionDesktop,
  coverObjectPositionMobile,
  gradient,
  eyebrow,
  title,
  subline,
}: Props) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay: index * 0.1 }}
    >
      <Link href={href} className="group block">
        {coverUrl ? (
          // Using <img> rather than next/image since cover URLs can come
          // from Supabase Storage without the next.config remote pattern
          // being pre-declared for every environment.
          //
          // The card frame stays a fixed 4:5 portrait so the grid keeps
          // its rhythm — but `object-contain` (was object-cover) shows
          // the WHOLE image inside instead of cropping to fill. Wider
          // 16:9 article-hero uploads now letterbox into the cream
          // background instead of being cropped on both sides; portrait
          // 4:5 thumbnails fill the frame naturally as before. The
          // background is `bg-rice-dim` so the letterboxing reads as
          // intentional editorial framing rather than a missing image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={title}
            // object-position via CSS custom properties (same pattern
            // as the popups + hero video). With object-contain the
            // values shift WHERE the letterboxed image sits inside
            // the 4:5 frame; if this ever switches back to
            // object-cover the same values control the crop centre.
            // Either way, "center" is the sensible default and the
            // current card behaviour is unchanged for posts that
            // haven't had a focal point set yet.
            className="aspect-[4/5] w-full bg-rice-dim object-contain transition-opacity group-hover:opacity-90 [object-position:var(--yur-journal-cover-mobile)] md:[object-position:var(--yur-journal-cover-desktop)]"
            style={
              {
                "--yur-journal-cover-desktop":
                  coverObjectPositionDesktop || "center",
                "--yur-journal-cover-mobile":
                  coverObjectPositionMobile || "center",
              } as React.CSSProperties
            }
          />
        ) : (
          <div
            className={`aspect-[4/5] bg-gradient-to-br ${
              gradient ?? "from-bone via-rice to-vermilion/20"
            } transition-opacity group-hover:opacity-90`}
          />
        )}
        <div className="mt-5 eyebrow">{eyebrow}</div>
        <h3 className="mt-2 font-display text-[22px] leading-tight text-ink group-hover:text-vermilion">
          {title}
        </h3>
        <div className="mt-3 text-[12px] uppercase tracking-caps text-ink-mid">
          {subline}
        </div>
      </Link>
    </motion.article>
  );
}
