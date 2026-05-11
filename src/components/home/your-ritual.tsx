// ─────────────────────────────────────────────────────────────────────────
// Your Skincare routine — editorial four-dot timeline.
//
// Replaced the old 2x2 grid (which made the section ~720px tall) with a
// horizontal hairline timeline that strings four vermilion dots together.
// One row of four cells, each holding the dot, an "01 · Cleanse" caption
// and the Korean character below. ~280px tall on desktop, ~340px on
// mobile — roughly half the previous footprint, and reads more like a
// skincare routine (a process) than a feature list.
//
// The connector line passes through the dot centres on the line `top-[7px]`
// because each dot is 14px tall and the line is positioned in absolute
// terms. The dots wear a 4px ivory border so the line looks like it slides
// behind them rather than terminating at the edge.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { MaehwaBranch } from "./maehwa-branch";

// Section heading comes from the admin-editable SiteCopy pipeline; the step
// labels (Cleanse/Treat/…) stay in messages/{locale}.json because they're
// tightly coupled to the skincare routine namespace and not in an admin's editing scope.
export type RitualCopy = {
  eyebrow: string;
  lede: string;
};

export function YourRitual({ copy }: { copy: RitualCopy }) {
  // Translation namespace key — must match messages/{locale}.json's
  // top-level "ritual" object. Was briefly renamed to "skincare routine"
  // by an over-eager find-replace and started crashing the whole
  // homepage with MISSING_MESSAGE on every render (which then cascaded
  // into hamburger / hydration failures on mobile).
  const tRitual = useTranslations("ritual");

  const steps = [
    { n: "01", key: "cleanse", kr: "세안" },
    { n: "02", key: "treat", kr: "집중" },
    { n: "03", key: "moisturise", kr: "보습" },
    { n: "04", key: "protect", kr: "보호" },
  ] as const;

  return (
    <section
      id="ritual"
      // py-14 mobile / py-20 desktop. Earlier values left the section
      // floating with whitespace — the timeline is so visually small
      // (just four 14px dots) that bigger padding looks broken.
      // Luxury polish #02: switched bg-ivory → bg-rice-dim. The site now
      // alternates rice → rice-dim → rice → rice-dim → rice through the
      // homepage scroll. The cream tones are close enough that the eye
      // reads it as warmth/depth rather than stripes.
      className="relative scroll-mt-24 bg-rice-dim py-14 sm:py-20"
    >
      {/* Decorative top-right maehwa branch — scaled down with the section.
          Original was h-64 w-96 / 40% opacity; the timeline layout has
          enough negative space already so we let the branch settle. */}
      <div className="pointer-events-none absolute right-0 top-0 h-40 w-64 opacity-30">
        <MaehwaBranch seed={2} className="h-full w-full" />
      </div>

      <div className="container relative">
        {/* Centered header so the section reads as one composition rather
            than a stranded headline floating on the left + a thin timeline
            stranded at the bottom. The lede is hard-capped at a much
            smaller size than text-display-md (which the homepage hero +
            bestsellers + testimonials all use) so the section stays in
            its lane — quiet caption, not another big headline. */}
        {(copy.eyebrow || copy.lede) ? (
          <div className="mb-12 text-center sm:mb-14">
            {copy.eyebrow ? <div className="eyebrow">{copy.eyebrow}</div> : null}
            {copy.lede ? (
              <h2 className="mx-auto mt-3 max-w-[44ch] font-display text-[20px] leading-snug text-ink sm:text-[26px] md:text-[30px]">
                {copy.lede}
              </h2>
            ) : null}
          </div>
        ) : null}

        {/* Timeline rail. The hairline rule sits behind the dots, clipped
            in by 12.5% on each side so it stops at the first/last dot
            centre rather than running edge-to-edge. */}
        <div className="relative pt-1">
          <div
            aria-hidden
            className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-[7px] h-px bg-ink/15"
          />

          <ol className="relative grid grid-cols-4 gap-x-1 sm:gap-x-4">
            {steps.map((s, i) => (
              <motion.li
                key={s.n}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="flex flex-col items-center text-center"
              >
                {/* Dot — vermilion fill with an ivory ring so the connector
                    line "tucks under" each dot instead of touching it.
                    Same size at every breakpoint so the line position
                    (top-[7px]) stays correct. */}
                <div
                  aria-hidden
                  className="h-3.5 w-3.5 rounded-full border-4 border-ivory bg-vermilion"
                />
                {/* Stacked layout on every screen: number → label → KR.
                    Inline `01 · Cleanse` was wrapping awkwardly on small
                    phones with longer translations (NL Beschermen,
                    RU Очистить). Stacking is bulletproof at 320px. */}
                <div className="mt-3 font-display text-[13px] leading-none text-vermilion sm:mt-4 sm:text-[16px]">
                  {s.n}
                </div>
                <div className="mt-1.5 text-[9px] uppercase tracking-label text-ink sm:mt-2 sm:text-[11px]">
                  {tRitual(s.key)}
                </div>
                <div className="font-kr mt-1 text-[11px] text-ink-mid sm:text-[13px]">
                  {s.kr}
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
