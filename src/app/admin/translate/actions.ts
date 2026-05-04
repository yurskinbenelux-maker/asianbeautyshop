// ─────────────────────────────────────────────────────────────────────────
// Server actions for the admin "Auto-translate from English" feature.
//
// Generic across every editor that wants the button: the client passes a
// record of `{fieldName: { value, isHtml } }`, we batch-translate the
// values via DeepL, and return `{fieldName: translatedValue}` in the same
// shape. The client decides which fields to fill (blanks vs everything).
//
// Auth: requireAdmin() is the only gate. Translation isn't dangerous, but
// the DeepL quota is a shared resource — anonymous traffic could drain
// the monthly free 500k chars in minutes if the action were public.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { Locale } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import {
  translateBatch,
  describeDeepLError,
} from "@/lib/translate/deepl";

export type TranslateField = {
  /** Source English text. Empty strings are echoed back untranslated. */
  value: string;
  /** Whether this field stores HTML (so DeepL preserves tags). */
  isHtml: boolean;
};

export type TranslateFieldsInput = {
  /** Map field names → English source value + isHtml flag. */
  fields: Record<string, TranslateField>;
  /** Target locale. EN is rejected (no-op). */
  targetLocale: Locale;
};

export type TranslateFieldsResult =
  | { ok: true; translations: Record<string, string> }
  | { ok: false; message: string };

/**
 * Translate a batch of fields from English into the target locale via
 * DeepL. Idempotent + side-effect-free — does NOT save anything; the
 * caller decides what to do with the result.
 */
export async function translateFieldsAction(
  input: TranslateFieldsInput,
): Promise<TranslateFieldsResult> {
  await requireAdmin();

  if (input.targetLocale === Locale.EN) {
    return { ok: false, message: "English is the source — nothing to translate." };
  }

  const fieldNames = Object.keys(input.fields);
  if (fieldNames.length === 0) {
    return { ok: true, translations: {} };
  }

  // We split fields into two batches: HTML and plain. Each goes to DeepL
  // with the right tag_handling flag. Two requests instead of two passes
  // through one — tiny extra latency, much cleaner output.
  const htmlNames: string[] = [];
  const plainNames: string[] = [];
  for (const name of fieldNames) {
    if (input.fields[name].isHtml) htmlNames.push(name);
    else plainNames.push(name);
  }

  const out: Record<string, string> = {};

  // ── HTML batch ──────────────────────────────────────────────────────
  if (htmlNames.length > 0) {
    const result = await translateBatch(
      htmlNames.map((n) => input.fields[n].value),
      {
        target: input.targetLocale,
        isHtml: true,
        formality: formalityFor(input.targetLocale),
      },
    );
    if (!result.ok) {
      return { ok: false, message: describeDeepLError(result.error) };
    }
    htmlNames.forEach((n, i) => {
      out[n] = result.translations[i];
    });
  }

  // ── Plain batch ─────────────────────────────────────────────────────
  if (plainNames.length > 0) {
    const result = await translateBatch(
      plainNames.map((n) => input.fields[n].value),
      {
        target: input.targetLocale,
        isHtml: false,
        formality: formalityFor(input.targetLocale),
      },
    );
    if (!result.ok) {
      return { ok: false, message: describeDeepLError(result.error) };
    }
    plainNames.forEach((n, i) => {
      out[n] = result.translations[i];
    });
  }

  return { ok: true, translations: out };
}

/** Luxury skincare reads more refined in formal register. DeepL only
 *  supports formality on a subset of locales — passing it for RU is a
 *  no-op (silently ignored) which is the behaviour we want. */
function formalityFor(locale: Locale): "more" | "less" | "default" {
  switch (locale) {
    case Locale.NL:
    case Locale.FR:
      return "more";
    case Locale.RU:
      // DeepL doesn't support formality on RU at the time of writing —
      // but the param is silently ignored if unsupported, so this is
      // future-proof against them adding it later.
      return "more";
    case Locale.EN:
      return "default";
  }
}
