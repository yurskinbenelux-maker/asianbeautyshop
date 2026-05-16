// ─────────────────────────────────────────────────────────────────────────
// Belgian fiscal quarter helpers — shared between the G6 BTW CSV export
// and the G13 quarterly PDF-ZIP exports on /admin/invoices.
//
// Belgian VAT quarters follow the calendar:
//   Q1 = Jan-Mar (months 0-2)
//   Q2 = Apr-Jun (3-5)
//   Q3 = Jul-Sep (6-8)
//   Q4 = Oct-Dec (9-11)
//
// All windows here are half-open [periodStart, periodEnd) so a row issued
// at 23:59:59 on the last day of the period is included and the next
// day's row is not — matches the BTW filing convention. The `issuedAt`
// timestamp on Invoice / CreditNote is the legal-effective date and
// admin can't edit it post-issue, so results are reproducible across
// reruns.
// ─────────────────────────────────────────────────────────────────────────

export type QuarterScope =
  | { kind: "quarter"; year: number; quarter: 1 | 2 | 3 | 4 }
  | { kind: "year"; year: number }
  | { kind: "all" };

export type QuarterWindow = {
  periodStart: Date;
  periodEnd: Date;
};

/**
 * Parse year + quarter strings (typically from URL search params) into a
 * structured scope. Tolerates missing / malformed input by falling back
 * to "all time" so a malformed URL never blanks the page.
 *
 * Inputs:
 *   year     — "2026", "" or null
 *   quarter  — "1".."4", "full", "all", "", or null
 *
 * Decision tree:
 *   year + (1..4)   → quarter scope
 *   year + "full"   → year scope (full calendar year)
 *   year + invalid  → year scope
 *   no year         → all time (latest 200 in the UI)
 */
export function parseQuarterParams(
  yearParam: string | null | undefined,
  quarterParam: string | null | undefined,
): QuarterScope {
  if (!yearParam) return { kind: "all" };
  const year = Number.parseInt(yearParam, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    return { kind: "all" };
  }

  if (!quarterParam || quarterParam === "full" || quarterParam === "all") {
    return { kind: "year", year };
  }

  const q = Number.parseInt(quarterParam, 10);
  if (q >= 1 && q <= 4) {
    return { kind: "quarter", year, quarter: q as 1 | 2 | 3 | 4 };
  }
  return { kind: "year", year };
}

/**
 * Turn a scope into a date window for `issuedAt: { gte, lt }` queries.
 * Returns `null` for the "all" case — callers should skip the date
 * filter entirely instead of passing a no-op range.
 */
export function quarterWindow(scope: QuarterScope): QuarterWindow | null {
  if (scope.kind === "all") return null;
  if (scope.kind === "year") {
    return {
      periodStart: new Date(scope.year, 0, 1, 0, 0, 0, 0),
      periodEnd: new Date(scope.year + 1, 0, 1, 0, 0, 0, 0),
    };
  }
  const startMonth = (scope.quarter - 1) * 3;
  return {
    periodStart: new Date(scope.year, startMonth, 1, 0, 0, 0, 0),
    periodEnd: new Date(scope.year, startMonth + 3, 1, 0, 0, 0, 0),
  };
}

/**
 * Filename-friendly slug — used for ZIP download filenames so the
 * accountant can drop them in a folder without renaming.
 *   { kind: "quarter", year: 2026, quarter: 2 } → "2026-Q2"
 *   { kind: "year",    year: 2026 }             → "2026"
 *   { kind: "all" }                             → "all-time"
 */
export function quarterSlug(scope: QuarterScope): string {
  if (scope.kind === "all") return "all-time";
  if (scope.kind === "year") return String(scope.year);
  return `${scope.year}-Q${scope.quarter}`;
}

/**
 * Human-readable label for headers, banners, and zero-state messages.
 *   { kind: "quarter", year: 2026, quarter: 2 } → "Q2 2026 (Apr – Jun)"
 *   { kind: "year",    year: 2026 }             → "Full year 2026"
 *   { kind: "all" }                             → "All time"
 */
export function quarterLabel(scope: QuarterScope): string {
  if (scope.kind === "all") return "All time";
  if (scope.kind === "year") return `Full year ${scope.year}`;
  const months = quarterMonthLabel(scope.quarter);
  return `Q${scope.quarter} ${scope.year} (${months})`;
}

export function quarterMonthLabel(q: 1 | 2 | 3 | 4): string {
  switch (q) {
    case 1: return "Jan – Mar";
    case 2: return "Apr – Jun";
    case 3: return "Jul – Sep";
    case 4: return "Oct – Dec";
  }
}
