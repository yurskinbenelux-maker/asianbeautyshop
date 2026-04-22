// ─────────────────────────────────────────────────────────────────────────
// Your Ritual — four-step editorial, alternating eye flow.
// Cleanse · Treat · Moisturise · Protect.
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
    <section id="ritual" className="relative scroll-mt-24 bg-ivory py-32">
      {/* decorative top-right maehwa */}
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-96 opacity-40">
        <MaehwaBranch seed={2} className="h-full w-full" />
      </div>

      <div className="container relative">
        <div className="mb-20 max-w-[26ch]">
          <div className="eyebrow">{copy.eyebrow}</div>
          <h2 className="mt-3 text-display-md">{copy.lede}</h2>
        </div>

        <ol className="grid grid-cols-1 gap-x-10 gap-y-16 md:grid-cols-2">
          {steps.map((s, i) => (
            <motion.li
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.12 }}
              className="grid grid-cols-[auto_1fr] items-start gap-8"
            >
              <div className="flex flex-col items-center">
                <div className="font-display text-[64px] leading-none text-vermilion">
                  {s.n}
                </div>
                <div className="font-kr mt-2 text-[18px] text-ink-mid">{s.kr}</div>
              </div>
              <div className="border-l border-ink/10 pl-8">
                <h3 className="font-display text-[28px] text-ink">
                  {tRitual(s.key)}
                </h3>
                <p className="mt-3 max-w-[36ch] text-[14px] leading-relaxed text-ink-mid">
                  A quiet moment at the basin. Warm water, a single product,
                  thirty seconds of attention.
                </p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
