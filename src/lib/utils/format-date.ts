// ─────────────────────────────────────────────────────────────────────────
// Belgian-time admin date formatters.
//
// All admin-facing date displays MUST go through these helpers. Why:
// Hostinger's Node runtime is UTC, so a naked `.toLocaleString()` or
// `Intl.DateTimeFormat(...)` without an explicit `timeZone` argument
// silently renders in UTC — which shows up as "GMT" everywhere in the
// admin and confuses Sofia (and the accountant) by an hour in winter,
// two in summer. These helpers pin formatting to Europe/Brussels, so
// DST handling is automatic.
//
// Locale is `en-GB` for consistency with the existing date-first
// 11 May 2026 format. We don't localise admin to the customer's
// preferredLocale because admin is one person operating Belgium-based.
// ─────────────────────────────────────────────────────────────────────────

const BRUSSELS = "Europe/Brussels";
const LOCALE = "en-GB";

/** "11 May 2026" — date only, used for receipts, audit summaries, etc. */
export const ADMIN_DATE_FMT = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: BRUSSELS,
});

/** "11 May 2026, 14:32" — date + minute precision. Default admin format. */
export const ADMIN_DATETIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: BRUSSELS,
});

/** "11/05/2026" — numeric date only, used in tight table columns. */
export const ADMIN_DATE_NUMERIC_FMT = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: BRUSSELS,
});

/** "14:32" — time only, for "today at HH:MM" composites. */
export const ADMIN_TIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: BRUSSELS,
});

/** Convenience: "11 May 2026" from a Date | string | null. */
export function formatAdminDate(d: Date | string | null | undefined): string {
  if (d == null) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return ADMIN_DATE_FMT.format(date);
}

/** Convenience: "11 May 2026, 14:32" from a Date | string | null. */
export function formatAdminDateTime(
  d: Date | string | null | undefined,
): string {
  if (d == null) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return ADMIN_DATETIME_FMT.format(date);
}
