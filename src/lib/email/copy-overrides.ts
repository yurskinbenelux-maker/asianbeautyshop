// ─────────────────────────────────────────────────────────────────────────
// Email copy overrides — read layer + merger.
//
// Each transactional email file ships a hardcoded `STRINGS: Record<Locale,
// Strings>` object holding default copy. Sofia can override any string
// field per-locale via /admin/emails/[key]/edit; those overrides land in
// the `EmailCopyOverride` table. At send time the `applyOverrides()`
// helper produces a merged Strings object: overridden string fields win,
// untouched fields fall through to defaults, and FUNCTION fields
// (e.g. `subject: (orderNo) => string`) are intentionally never replaced
// because their dynamic placeholders would break the receipt.
//
// All exports are server-only.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type EmailOverrides = Map<string, string>;

/** Read every override row for a single (emailKey, locale) combo and
 *  return a Map keyed by fieldKey. Empty Map if Sofia hasn't tweaked
 *  this email in this locale yet. */
export async function getEmailOverrides(
  emailKey: string,
  locale: Locale,
): Promise<EmailOverrides> {
  const rows = await prisma.emailCopyOverride.findMany({
    where: { emailKey, locale },
    select: { fieldKey: true, value: true },
  });
  return new Map(rows.map((r: { fieldKey: string; value: string }) => [r.fieldKey, r.value]));
}

/** Same as getEmailOverrides but returns all 4 locales at once —
 *  used by the admin editor which needs to populate every textarea
 *  on initial render. */
export async function getAllOverridesByLocale(
  emailKey: string,
): Promise<Record<Locale, EmailOverrides>> {
  const rows = await prisma.emailCopyOverride.findMany({
    where: { emailKey },
    select: { locale: true, fieldKey: true, value: true },
  });
  const result: Record<Locale, EmailOverrides> = {
    [Locale.EN]: new Map(),
    [Locale.NL]: new Map(),
    [Locale.FR]: new Map(),
    [Locale.RU]: new Map(),
  };
  for (const row of rows as Array<{
    locale: Locale;
    fieldKey: string;
    value: string;
  }>) {
    result[row.locale].set(row.fieldKey, row.value);
  }
  return result;
}

/**
 * Merge a defaults object with override values. Used by every email
 * builder: `const s = applyOverrides(STRINGS[locale] ?? STRINGS.EN, options?.overrides)`.
 *
 * Rules:
 *  · Only string fields are overridable. If `defaults[k]` is a string and
 *    the override Map has a non-empty entry for `k`, the override wins.
 *  · Function fields (`subject: (n) => string`) are kept as-is. The
 *    admin UI flags those as read-only with a "contains dynamic
 *    content" warning so Sofia can't accidentally replace them with
 *    plain text and lose her order-number / first-name interpolations.
 *  · Empty-string overrides are ignored — clearing a textarea in admin
 *    means "use the default", not "send blank".
 */
export function applyOverrides<T extends object>(
  defaults: T,
  overrides?: EmailOverrides,
): T {
  if (!overrides || overrides.size === 0) return defaults;

  // Spread to a new object so we don't mutate the cached STRINGS
  // table that lives at module scope. Function fields land in the
  // copy unchanged because spread copies references.
  const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [key, value] of overrides) {
    if (!(key in merged)) continue;
    if (typeof merged[key] !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    merged[key] = value;
  }
  return merged as T;
}
