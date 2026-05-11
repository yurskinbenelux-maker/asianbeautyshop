// ─────────────────────────────────────────────────────────────────────────
// deepl.ts — thin wrapper around the DeepL Free API.
//
// Why DeepL: best-in-class quality for our actual locale pairs (EN→NL,
// EN→FR, EN→RU), HTML tag preservation built in, and the free tier
// (500k chars/month) comfortably covers an admin's whole catalogue. We only
// call this from server-side code — the API key never touches the
// browser.
//
// The single export is `translateBatch`. Callers pass an array of texts
// (so the round-trip cost is amortised across all 8 product fields in
// one call) and receive translations in matching order.
//
// HTML handling: DeepL's `tag_handling=html` keeps `<p>`, `<strong>`,
// `<ul>` etc. intact. For plain inputs we send `tag_handling=` (off) so
// stray "<" characters in copy don't get treated as markup.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";

/** Maps our Prisma Locale enum to DeepL's target language codes.
 *  EN-GB vs EN-US doesn't matter for source — DeepL auto-detects "EN".
 *  For Russian we use plain "RU" (DeepL has no regional variants). */
const DEEPL_TARGET: Record<Locale, string> = {
  EN: "EN-GB",
  NL: "NL",
  FR: "FR",
  RU: "RU",
};

/** Free vs Pro endpoint. The free key has a `:fx` suffix — we sniff it
 *  so swapping to Pro later is just an env var change, no code change. */
function endpointForKey(apiKey: string): string {
  return apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
}

export type TranslateOptions = {
  /** Target locale. Source is always English (EN). */
  target: Locale;
  /** When true, sends `tag_handling=html` so DeepL preserves markup. */
  isHtml?: boolean;
  /** Optional formality. DeepL supports "more"/"less" for some languages
   *  (NL, FR, RU). For luxury skincare we lean "more" by default — the
   *  copy reads more refined. */
  formality?: "more" | "less" | "default";
};

export type DeepLError =
  | { kind: "missing-key" }
  | { kind: "rate-limited" }
  | { kind: "quota-exceeded" }
  | { kind: "auth-failed" }
  | { kind: "network"; message: string }
  | { kind: "api"; status: number; message: string };

export type TranslateResult =
  | { ok: true; translations: string[] }
  | { ok: false; error: DeepLError };

/**
 * Translate a batch of texts from English to the target locale.
 * Empty strings pass through untouched (DeepL would charge a request
 * just to give us back ""). Order is preserved.
 */
export async function translateBatch(
  texts: ReadonlyArray<string>,
  options: TranslateOptions,
): Promise<TranslateResult> {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { kind: "missing-key" } };
  }

  // Short-circuit empty arrays so we don't make a no-op request.
  if (texts.length === 0) {
    return { ok: true, translations: [] };
  }

  // Carve out empty strings — DeepL refuses them, and we'd rather return
  // empty in the same slot than translate "" → some artefact.
  const indexed = texts.map((t, i) => ({ i, text: t }));
  const nonEmpty = indexed.filter((x) => x.text.trim().length > 0);
  if (nonEmpty.length === 0) {
    return { ok: true, translations: texts.map(() => "") };
  }

  // DeepL expects repeated `text=` params, x-www-form-urlencoded.
  const params = new URLSearchParams();
  for (const x of nonEmpty) params.append("text", x.text);
  params.append("source_lang", "EN");
  params.append("target_lang", DEEPL_TARGET[options.target]);
  if (options.isHtml) params.append("tag_handling", "html");
  if (options.formality && options.formality !== "default") {
    // Russian + a few others don't support formality — DeepL silently
    // ignores it for those, which is the behaviour we want.
    params.append("formality", options.formality);
  }
  // Don't translate brand names. DeepL leaves these substrings untouched
  // when wrapped in `<x>` tags marked via ignore_tags. But that's only
  // active when tag_handling is on, which it always is for HTML fields.
  // For plain fields, DeepL is generally good at leaving roman-letter
  // brand names alone — we accept the imperfection there.

  let res: Response;
  try {
    res = await fetch(endpointForKey(apiKey), {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      // Reasonable cap — DeepL is normally ~1s per call.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "network",
        message: err instanceof Error ? err.message : "fetch failed",
      },
    };
  }

  if (!res.ok) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      /* swallow — error message just won't include body */
    }
    if (res.status === 403) {
      return { ok: false, error: { kind: "auth-failed" } };
    }
    if (res.status === 429) {
      return { ok: false, error: { kind: "rate-limited" } };
    }
    if (res.status === 456) {
      // DeepL's "Quota exceeded" for the month.
      return { ok: false, error: { kind: "quota-exceeded" } };
    }
    return {
      ok: false,
      error: {
        kind: "api",
        status: res.status,
        message: bodyText.slice(0, 200) || res.statusText,
      },
    };
  }

  let payload: { translations?: { text: string }[] };
  try {
    payload = (await res.json()) as { translations?: { text: string }[] };
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "api",
        status: res.status,
        message: err instanceof Error ? err.message : "non-JSON body",
      },
    };
  }
  const translatedTexts = (payload.translations ?? []).map((t) => t.text);
  if (translatedTexts.length !== nonEmpty.length) {
    return {
      ok: false,
      error: {
        kind: "api",
        status: res.status,
        message: `expected ${nonEmpty.length} translations, got ${translatedTexts.length}`,
      },
    };
  }

  // Stitch translations back into the full-size output array, with empty
  // slots preserved at their original indices.
  const output = texts.map((t) => (t.trim().length === 0 ? "" : t));
  nonEmpty.forEach((x, idx) => {
    output[x.i] = translatedTexts[idx];
  });

  return { ok: true, translations: output };
}

/** Friendly error message for the admin UI. Hides DeepL implementation
 *  detail — an admin doesn't need to know what HTTP 456 means. */
export function describeDeepLError(err: DeepLError): string {
  switch (err.kind) {
    case "missing-key":
      return "Translation isn't configured yet. Add DEEPL_API_KEY in Hostinger settings.";
    case "auth-failed":
      return "DeepL key is invalid or expired. Check the value in Hostinger settings.";
    case "rate-limited":
      return "DeepL is busy. Try again in a moment.";
    case "quota-exceeded":
      return "DeepL monthly free quota is used up. Translation will resume next month, or upgrade DeepL.";
    case "network":
      return `Couldn't reach DeepL: ${err.message}`;
    case "api":
      return `DeepL responded with ${err.status}: ${err.message}`;
  }
}
