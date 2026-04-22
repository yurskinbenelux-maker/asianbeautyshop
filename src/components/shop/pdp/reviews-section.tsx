// ─────────────────────────────────────────────────────────────────────────
// ReviewsSection — the bottom-of-PDP reviews block.
//
// Three pieces of UI:
//   · Rating summary  — big average, star row, total count
//   · Distribution    — 5→1 rows with a thin vermilion bar
//   · Review list     — up to 8 published reviews, locale-preferred
//
// If there are zero reviews we show a quiet empty state inviting the
// customer to be the first — still keeps the summary block present so
// the layout doesn't feel truncated.
// ─────────────────────────────────────────────────────────────────────────

import { Star, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PdpReview, PdpReviewSummary } from "@/lib/queries/pdp";

type Labels = {
  eyebrow: string;        // "Reviews"
  averageTitle: string;   // "Average rating"
  countOne: string;       // "1 review"
  countOther: string;     // "{count} reviews"
  verified: string;       // "Verified"
  noneTitle: string;      // "No reviews yet."
  noneBody: string;       // "Be the first to write about your experience."
  outOfFive: string;      // "out of 5"
};

export function ReviewsSection({
  summary,
  reviews,
  labels,
  dateLocale,
}: {
  summary: PdpReviewSummary;
  reviews: PdpReview[];
  labels: Labels;
  dateLocale: string;
}) {
  const fmtCount = (n: number) =>
    n === 1 ? labels.countOne : labels.countOther.replace("{count}", String(n));

  return (
    <section className="container mt-24">
      <div className="eyebrow">{labels.eyebrow}</div>

      <div className="mt-8 grid grid-cols-1 gap-12 md:grid-cols-[minmax(0,280px)_1fr]">
        {/* ── summary ─────────────────────────────────────────── */}
        <aside>
          <div className="flex items-baseline gap-2">
            <div className="font-display text-[54px] leading-none text-ink">
              {summary.average !== null ? summary.average.toFixed(1) : "—"}
            </div>
            <div className="text-[11px] uppercase tracking-label text-ink-mid">
              {labels.outOfFive}
            </div>
          </div>
          <StarRow value={summary.average ?? 0} className="mt-3" size={18} />
          <div className="mt-2 text-[12px] text-ink-mid">
            {fmtCount(summary.count)}
          </div>

          {summary.count > 0 && (
            <ul className="mt-6 space-y-1.5">
              {([5, 4, 3, 2, 1] as const).map((r) => {
                const n = summary.distribution[r];
                const pct =
                  summary.count > 0 ? Math.round((n / summary.count) * 100) : 0;
                return (
                  <li
                    key={r}
                    className="grid grid-cols-[12px_1fr_36px] items-center gap-3 text-[11px] text-ink-mid"
                  >
                    <span className="font-mono">{r}</span>
                    <div className="h-1 bg-ink/10">
                      <div
                        className="h-full bg-vermilion transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-right font-mono">{n}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ── review list ──────────────────────────────────────── */}
        <div>
          {summary.count === 0 ? (
            <div className="border border-dashed border-ink/15 bg-rice-dim/40 p-10 text-center">
              <div className="font-display text-[22px] text-ink">
                {labels.noneTitle}
              </div>
              <p className="mt-2 text-[13px] text-ink-mid">{labels.noneBody}</p>
            </div>
          ) : (
            <ol className="divide-y divide-ink/10">
              {reviews.map((r) => (
                <li key={r.id} className="py-6 first:pt-0">
                  <div className="flex items-center gap-3">
                    <StarRow value={r.rating} size={14} />
                    {r.isVerified && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-label text-celadon">
                        <BadgeCheck className="h-3 w-3" aria-hidden />
                        {labels.verified}
                      </span>
                    )}
                  </div>
                  {r.title && (
                    <h3 className="mt-2 font-display text-[18px] leading-tight text-ink">
                      {r.title}
                    </h3>
                  )}
                  <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-mid">
                    {r.body}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-[11px] uppercase tracking-label text-ink-mid">
                    <span>{r.authorName}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={r.createdAt.toISOString()}>
                      {r.createdAt.toLocaleDateString(dateLocale, {
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

// ── bits ────────────────────────────────────────────────────────────────

function StarRow({
  value,
  size = 16,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  // Convert a 0-5 rating to 5 star icons, each either full or empty.
  // We don't do half-stars — the sample size for a boutique won't move
  // the needle enough to bother, and it keeps the SVG cheap.
  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          width={size}
          height={size}
          className={cn(
            "transition-colors",
            n <= Math.round(value)
              ? "fill-vermilion text-vermilion"
              : "fill-none text-ink/20",
          )}
        />
      ))}
    </div>
  );
}
