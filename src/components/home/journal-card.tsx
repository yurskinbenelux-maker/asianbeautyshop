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
  gradient?: string;
  eyebrow: string;
  title: string;
  subline: string;
};

export function JournalCard({
  index,
  href,
  coverUrl,
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={title}
            className="aspect-[4/5] w-full object-cover transition-opacity group-hover:opacity-90"
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
