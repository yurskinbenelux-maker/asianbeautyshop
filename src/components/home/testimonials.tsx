// ─────────────────────────────────────────────────────────────────────────
// Testimonials — three muted pull quotes on the rice-paper ground.
//
// 2026 polish pass:
//   · Adds an editorial lede under the eyebrow so the section doesn't
//     lead with a bare pull quote.
//   · Each card now carries a 5-dot rating, the product it praises, a
//     "verified purchase" stamp, and a hairline divider to separate the
//     quote from the attribution.
//   · Hover lifts the card by 4px with a quiet spring — nothing flashy.
//     The MotionConfig up in the layout makes this instant for users
//     with prefers-reduced-motion set.
//
// Copy placeholder until an admin provides real customer letters.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { motion } from "framer-motion";
import type { TestimonialCard } from "@/lib/queries/testimonial";

// Hardcoded fallback trio — rendered only if the DB is empty (first-run
// before an admin adds any rows in /admin/testimonials). Each card matches
// the TestimonialCard shape the real query returns so downstream rendering
// doesn't need a branch.
const FALLBACK: TestimonialCard[] = [
  {
    id: "fallback-1",
    rating: 5,
    verified: true,
    quote: "My skin stopped reacting. First product I've trusted in years.",
    authorName: "M. — Brussels",
    productName: "Ginseng Essence",
  },
  {
    id: "fallback-2",
    rating: 5,
    verified: true,
    quote: "The skincare routine is the best part of my day. Quiet, warm, slow.",
    authorName: "S. — Rotterdam",
    productName: "Evening skincare routine set",
  },
  {
    id: "fallback-3",
    rating: 5,
    verified: true,
    quote: "Everything arrived beautifully packed. It feels like a gift.",
    authorName: "J. — Paris",
    productName: "First order",
  },
];

// `verified` is a label, not a boolean — we still read the verified flag
// off each row, but the chip copy comes from the section messages (it's
// not admin-editable because it's tiny UI chrome).
export type TestimonialsCopy = {
  eyebrow: string;
  lede: string;
  verified: string;
};

export function Testimonials({
  copy,
  items,
}: {
  copy: TestimonialsCopy;
  items: TestimonialCard[];
}) {
  const rows = items.length > 0 ? items : FALLBACK;

  return (
    <section className="container py-32">
      {(copy.eyebrow || copy.lede) ? (
        <div className="mb-16 text-center">
          {copy.eyebrow ? <div className="eyebrow">{copy.eyebrow}</div> : null}
          {copy.lede ? (
            <p className="mx-auto mt-4 max-w-[48ch] text-[15px] leading-relaxed text-ink-mid">
              {copy.lede}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
        {rows.map((q, i) => (
          <motion.figure
            key={q.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, delay: i * 0.1 }}
            whileHover={{ y: -4 }}
            className="relative pt-10"
          >
            {/* oversized opening quote mark */}
            <span
              className="absolute -top-2 left-0 font-display text-[72px] leading-none text-vermilion/40"
              aria-hidden
            >
              &ldquo;
            </span>

            {/* 5-dot rating — intentionally dots not stars so it feels
                like our brand motifs rather than a generic ★★★★★ row. */}
            <Rating value={q.rating} />

            <blockquote className="mt-5 font-display text-[22px] leading-snug text-ink">
              {q.quote}
            </blockquote>

            <div className="mt-8 h-px w-10 bg-ink/20" aria-hidden />

            <figcaption className="mt-5 space-y-2">
              <div className="text-[12px] uppercase tracking-caps text-ink">
                {q.authorName}
              </div>
              {q.productName && (
                <div className="text-[11px] uppercase tracking-label text-ink-mid">
                  {q.productName}
                </div>
              )}
              {q.verified && <VerifiedPill label={copy.verified} />}
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}

/** 5-dot rating row — vermilion for earned, ink/15 for unearned. */
function Rating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Rated ${value} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={
            i < value
              ? "h-1.5 w-1.5 rounded-full bg-vermilion"
              : "h-1.5 w-1.5 rounded-full bg-ink/15"
          }
          aria-hidden
        />
      ))}
    </div>
  );
}

/** Small "verified" chip. Plain span, no icon — stays editorial. */
function VerifiedPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center border border-celadon/40 bg-celadon/10 px-2 py-1 text-[10px] uppercase tracking-label text-celadon">
      {label}
    </span>
  );
}
