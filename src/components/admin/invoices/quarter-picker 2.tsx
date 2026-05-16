// ─────────────────────────────────────────────────────────────────────────
// QuarterPicker (G13)
//
// Two-select filter on /admin/invoices:
//   · Year   — current year + 2 previous (3-year window covers Belgian
//               7-year retention at any realistic launch cadence)
//   · Period — "Full year" + Q1..Q4 + "All time"
//
// Submits via plain URL navigation (router.push) so the page re-renders
// server-side with the new searchParams. No state lives in the picker —
// the URL is the source of truth, which means an admin can bookmark or
// share a filtered view.
//
// "All time" resets both params (empty year, empty quarter) so the page
// falls back to its default "latest 200" behaviour.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

// 3-year window. If admin ever needs to pull older periods we widen
// this; keeps the dropdown short for the 99% case.
function getYearOptions(): number[] {
  const now = new Date().getFullYear();
  return [now, now - 1, now - 2];
}

type Period =
  | "all"
  | "full"
  | "1"
  | "2"
  | "3"
  | "4";

type Props = {
  /** Initial year value from the URL. null → no year filter active. */
  initialYear: number | null;
  /** Initial period value derived from the URL. */
  initialPeriod: Period;
};

export function QuarterPicker({ initialYear, initialPeriod }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function navigate(next: { year: number | null; period: Period }) {
    const params = new URLSearchParams(searchParams.toString());

    if (next.period === "all" || next.year === null) {
      params.delete("year");
      params.delete("quarter");
    } else {
      params.set("year", String(next.year));
      if (next.period === "full") {
        params.set("quarter", "full");
      } else {
        params.set("quarter", next.period);
      }
    }

    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/admin/invoices?${query}` : "/admin/invoices");
    });
  }

  const years = getYearOptions();
  const currentYear = initialYear ?? years[0];

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Period (all + full year + four quarters) */}
      <label className="block">
        <span className="mb-1.5 block text-[11px] uppercase tracking-label text-ink-mid">
          Period
        </span>
        <select
          value={initialPeriod}
          disabled={pending}
          onChange={(e) => {
            const period = e.target.value as Period;
            navigate({
              year: period === "all" ? null : currentYear,
              period,
            });
          }}
          className="block h-10 min-w-[180px] border border-ink/15 bg-white px-3 text-[13px] text-ink focus:border-vermilion focus:outline-none disabled:opacity-60"
        >
          <option value="all">All time</option>
          <option value="full">Full year</option>
          <option value="1">Q1 (Jan – Mar)</option>
          <option value="2">Q2 (Apr – Jun)</option>
          <option value="3">Q3 (Jul – Sep)</option>
          <option value="4">Q4 (Oct – Dec)</option>
        </select>
      </label>

      {/* Year — disabled when scope is "all" since the year doesn't apply */}
      <label className="block">
        <span className="mb-1.5 block text-[11px] uppercase tracking-label text-ink-mid">
          Year
        </span>
        <select
          value={currentYear}
          disabled={pending || initialPeriod === "all"}
          onChange={(e) => {
            const year = Number.parseInt(e.target.value, 10);
            navigate({ year, period: initialPeriod });
          }}
          className="block h-10 min-w-[100px] border border-ink/15 bg-white px-3 text-[13px] text-ink focus:border-vermilion focus:outline-none disabled:opacity-60"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      {/* Pending hint — softens the perceived latency of the route reload
       *  on a slow network without a separate spinner. */}
      {pending ? (
        <span className="pb-3 text-[11px] uppercase tracking-label text-ink-mid">
          Loading…
        </span>
      ) : null}
    </div>
  );
}
