// ─────────────────────────────────────────────────────────────────────────
// Hero B — Moon Jar.
// Full-viewport, centered, atmospheric. Soft warm radial glow ("moonjar"),
// oversized Fraunces headline wrapping a Korean character "첫" (first),
// and drifting vermilion petals animated via Framer Motion.
//
// 2026 polish pass:
//   · Scroll-driven parallax on the glow (subtle, short range) and moon
//     jar silhouette — gives the section depth without any extra weight.
//   · Petal layer has its own, slower parallax so it feels like snow
//     outside a window rather than plastered onto the headline.
//   · All motion routes through MotionConfig (reducedMotion="user"), so
//     the parallax and petals flatten automatically when the visitor
//     has `prefers-reduced-motion: reduce` set.
//
// Max locked this direction. Keep the composition calm — the whole page's
// character descends from this hero.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Link } from "@/i18n/routing";
import { ArrowRight } from "lucide-react";

// Pre-computed petal paths for consistency across renders
const PETALS = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  left: `${(i * 37) % 100}%`,
  delay: i * 1.3,
  size: 8 + ((i * 7) % 9),
  dx: ((i * 19) % 120) - 60,
  dy: 200 + ((i * 23) % 140),
  duration: 14 + ((i * 3) % 8),
}));

// Copy shape — every string is already resolved on the server (either from
// the SiteCopy admin overrides or the messages/{locale}.json fallback).
// We stopped calling useTranslations here so the hero renders exactly what
// Sofia saved without going back through the translator pipeline.
export type HeroCopy = {
  eyebrow: string;
  title_pre: string;
  title_kr: string;
  title_post: string;
  lede: string;
  cta_primary: string;
  cta_secondary: string;
};

export function HeroMoonJar({ copy }: { copy: HeroCopy }) {

  // Track scroll *relative to the hero section itself* — starts at 0 when
  // the hero top meets the viewport top, reaches 1 when the hero bottom
  // leaves the viewport top. This makes the parallax self-contained.
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // Layered parallax speeds — the further back a layer, the slower it
  // moves, the more depth we imply. Keep the ranges small so nothing
  // leaves the frame unnaturally.
  const glowY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const jarY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const petalsY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const headlineY = useTransform(scrollYProgress, [0, 1], ["0%", "-8%"]);
  const headlineOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative isolate flex min-h-[92vh] items-center justify-center overflow-hidden"
    >
      {/* ── moon-jar glow (deepest layer) ─────────────────────── */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ y: glowY }}
      >
        <div className="moonjar-glow absolute left-1/2 top-1/2 h-[1100px] w-[1100px] -translate-x-1/2 -translate-y-1/2" />
      </motion.div>

      {/* ── moon-jar silhouette ───────────────────────────────── */}
      <motion.svg
        className="pointer-events-none absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-[46%] opacity-[0.08]"
        viewBox="0 0 600 600"
        style={{ y: jarY }}
        aria-hidden
      >
        {/* Classic Joseon moon jar — imperfect circle, slight flatten at top */}
        <path
          d="M300 90
             C 180 90, 90 200, 90 320
             C 90 450, 180 520, 300 520
             C 420 520, 510 450, 510 320
             C 510 200, 420 90, 300 90 Z"
          fill="#121110"
        />
      </motion.svg>

      {/* ── drifting petals (parallax + loop) ─────────────────── */}
      <motion.div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ y: petalsY }}
      >
        {PETALS.map((p) => (
          <motion.span
            key={p.id}
            className="absolute -top-10 block"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
            }}
            initial={{ y: -40, x: 0, opacity: 0, rotate: 0 }}
            animate={{
              y: p.dy + 600,
              x: p.dx,
              opacity: [0, 0.85, 0.7, 0],
              rotate: 360,
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              delay: p.delay,
              ease: "linear",
              times: [0, 0.1, 0.8, 1],
            }}
          >
            {/* 5-circle vermilion blossom */}
            <svg viewBox="-10 -10 20 20" className="h-full w-full">
              {[0, 72, 144, 216, 288].map((a) => (
                <circle
                  key={a}
                  cx={Math.cos((a * Math.PI) / 180) * 4}
                  cy={Math.sin((a * Math.PI) / 180) * 4}
                  r={3.8}
                  fill="#C8102E"
                  opacity="0.9"
                />
              ))}
              <circle r={1} fill="#7A0A1A" />
            </svg>
          </motion.span>
        ))}
      </motion.div>

      {/* ── headline composition ──────────────────────────────── */}
      <motion.div
        className="container relative z-10"
        style={{ y: headlineY, opacity: headlineOpacity }}
      >
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="eyebrow text-center"
        >
          {copy.eyebrow}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.35 }}
          className="mx-auto mt-6 max-w-[18ch] text-center text-display-xl text-ink"
        >
          <span className="italic text-ink-soft">{copy.title_pre} </span>
          <span className="font-kr mx-2 text-vermilion" aria-hidden>
            {copy.title_kr}
          </span>
          <br className="hidden md:block" />
          <span>{copy.title_post}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.6 }}
          className="mx-auto mt-8 max-w-[48ch] text-center text-[15px] leading-relaxed text-ink-mid"
        >
          {copy.lede}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.85 }}
          className="mt-10 flex flex-col items-center justify-center gap-4 md:flex-row md:gap-6"
        >
          <Link
            href="/shop"
            className="group inline-flex items-center gap-3 bg-ink px-8 py-4 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion"
          >
            {copy.cta_primary}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
          {/* Hero secondary CTA — funnels to the skin quiz. Was an
              anchor to the on-page "Your routine" section; we now drive
              quiz starts from here because (a) the quiz is the strongest
              conversion path on the site and (b) it ties into the −15%
              quiz-reward funnel. Uses next-intl's <Link> so the locale
              prefix is preserved automatically. */}
          <Link
            href="/quiz"
            className="inline-flex items-center gap-2 border-b border-ink/30 pb-1 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-vermilion hover:text-vermilion"
          >
            {copy.cta_secondary}
          </Link>
        </motion.div>
      </motion.div>

      {/* ── scroll affordance ─────────────────────────────────── */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-caps text-ink-mid">
        ↓ scroll
      </div>
    </section>
  );
}
