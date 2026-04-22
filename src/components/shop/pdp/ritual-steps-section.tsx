// ─────────────────────────────────────────────────────────────────────────
// RitualStepsSection — the numbered "01 / 02 / 03" cards that walk
// customers through how to use this product in a multi-step routine.
//
// Server component: it just renders the rows that come back from
// getProductRitualSteps(). Each step shows:
//   · Step number in the Korean serif (seal)
//   · Time-of-day badge (Morning / Evening / Any time)
//   · Title + rich HTML body
// ─────────────────────────────────────────────────────────────────────────

import { Sun, Moon, Sparkles } from "lucide-react";
import type { PdpRitualStep } from "@/lib/queries/pdp";

type Labels = {
  eyebrow: string;        // "The ritual"
  morning: string;        // "Morning"
  evening: string;        // "Evening"
  anyTime: string;        // "Any time"
};

export function RitualStepsSection({
  steps,
  labels,
}: {
  steps: PdpRitualStep[];
  labels: Labels;
}) {
  if (steps.length === 0) return null;

  return (
    <section className="container mt-24">
      <div className="mx-auto max-w-4xl">
        <div className="eyebrow">{labels.eyebrow}</div>
        <div className="mt-10 space-y-px border border-ink/10 bg-ink/10">
          {steps.map((step) => {
            const { icon: Icon, label } = timeOfDayMeta(step.timeOfDay, labels);

            return (
              <article
                key={step.id}
                className="flex flex-col gap-6 bg-rice p-6 sm:flex-row sm:items-start sm:p-8"
              >
                {/* numbered seal */}
                <div className="flex items-start gap-4 sm:w-40 sm:flex-shrink-0">
                  <div className="font-kr text-[40px] leading-none text-vermilion">
                    {String(step.stepNumber).padStart(2, "0")}
                  </div>
                  <div className="mt-2">
                    <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-label text-ink-mid">
                      <Icon className="h-3 w-3" aria-hidden />
                      {label}
                    </div>
                  </div>
                </div>

                {/* copy */}
                <div className="flex-1">
                  <h3 className="font-display text-[22px] leading-tight text-ink">
                    {step.title}
                  </h3>
                  <div
                    className="prose-editorial mt-3 text-[14px] leading-[1.7] text-ink-mid"
                    dangerouslySetInnerHTML={{ __html: step.bodyHtml }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────

function timeOfDayMeta(
  t: PdpRitualStep["timeOfDay"],
  labels: Labels,
): { icon: React.ComponentType<{ className?: string }>; label: string } {
  switch (t) {
    case "MORNING":
      return { icon: Sun, label: labels.morning };
    case "EVENING":
      return { icon: Moon, label: labels.evening };
    default:
      return { icon: Sparkles, label: labels.anyTime };
  }
}
