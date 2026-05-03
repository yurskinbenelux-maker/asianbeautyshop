// ─────────────────────────────────────────────────────────────────────────
// Your Ritual — editorial four-dot timeline.
//
// Replaced the old 2x2 grid (which made the section ~720px tall) with a
// horizontal hairline timeline that strings four vermilion dots together.
// One row of four cells, each holding the dot, an "01 · Cleanse" caption
// and the Korean character below. ~280px tall on desktop, ~340px on
// mobile — roughly half the previous footprint, and reads more like a
// ritual (a process) than a feature list.
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
// tightly coupled to the ritual namespace and not in Sofia's editing scope.
export type RitualCopy = {
  eyebrow: string;
  lede: string;
};

export function YourRitual({ copy }: { copy: RitualCopy }) {
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
      // py-24 (down from py-32). The section is short now; matching the
      // previous outsized padding would leave it floating with whitespace.
      className="relative scroll-mt-24 bg-ivory py-24"
    >
      {/* Decorative top-right maehwa branch — scaled down with the section.
          Original was h-64 w-96 / 40% opacity; the timeline layout has
          enough negative space already so we let the branch settle. */}
      <div className="pointer-events-none absolute right-0 top-0 h-40 w-64 opacity-30">
        <MaehwaBranch seed={2} className="h-full w-full" />
      </div>

      <div className="container relative">
        {/* Voided fields ("" from siteCopyOr) collapse the wrapper entirely
            so a hidden eyebrow/lede doesn't reserve vertical space. */}
        {(copy.eyebrow || copy.lede) ? (
          <div className="mb-14 max-w-[28ch]">
            {copy.eyebrow ? <div className="eyebrow">{copy.eyebrow}</div> : null}
            {copy.lede ? (
              <h2 className="mt-3 text-display-md">{copy.lede}</h2>
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

          <ol className="relative grid grid-cols-4 gap-x-2">
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
                    line "tucks under" each dot instead of touching it. */}
                <div
                  aria-hidden
                  className="h-3.5 w-3.5 rounded-full border-4 border-ivory bg-vermilion"
                />
                <div className="mt-4 text-[10px] uppercase tracking-label text-ink sm:text-[11px]">
                  <span className="font-display text-vermilion">{s.n}</span>
                  <span className="mx-1.5 text-ink/30">·</span>
                  {tRitual(s.key)}
                </div>
                <div className="font-kr mt-1 text-[12px] text-ink-mid sm:text-[13px]">
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
