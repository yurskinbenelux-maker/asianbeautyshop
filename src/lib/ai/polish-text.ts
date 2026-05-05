// ─────────────────────────────────────────────────────────────────────────
// polish-text — admin-side text refinement via Groq.
//
// Two modes per call, dispatched by `locale`:
//
//   EN:  improve the existing English copy — fix grammar, sharpen
//        sensory descriptors, match the YU.R voice. Strict rule: NEVER
//        invent ingredient claims that aren't in the source. The model
//        is editing what's there, not authoring fresh marketing.
//
//   NL/FR/RU: improve the existing translation, OR translate from EN if
//        empty. Match native idioms in the target locale, preserve
//        meaning, keep the YU.R voice. We pass BOTH the EN source AND
//        the current translated value so the model can choose: use the
//        translation if non-empty (improve it), else translate from EN.
//
// Cosmetic-claim guardrail (EU CPNP regulation): Sofia faces fines if
// she ships product copy with unsubstantiated medical or efficacy
// claims. The system prompt explicitly forbids "anti-aging", "cures",
// "treats", "heals", "removes wrinkles", and similar. The model is
// allowed to describe sensory effects ("smooths", "softens"), feel
// ("dewy", "weightless"), and ingredient context ("rich in
// niacinamide"), but never promises results.
//
// HTML preservation: description + howToUse are HTML. The prompt
// instructs the model to preserve the existing HTML tag structure
// (paragraphs, lists, line breaks) and only rewrite the text inside
// tags. shortDescription / name are plain text.
// ─────────────────────────────────────────────────────────────────────────

import { generateObject } from "ai";
import { z } from "zod";
import { Locale } from "@prisma/client";
import { getGroqModel } from "./groq";

// ──────── Brand voice — derived from YU.R's own product copy ───────────
//
// Inferred from the existing seed product descriptions. Sofia's client
// (the YU.R brand owner) wrote those, so they ARE the voice. If the
// brand voice ever drifts, edit this constant rather than hunting
// through every prompt.
const BRAND_VOICE = `
The YU.R voice is:
  · Warm, sensory, ritual-led — feel + texture + how it sits on skin.
  · Concise. Sentences are short. No buzzword soup.
  · Mentions one or two hero ingredients with their effect ("with
    fermented rice water, made for sensitive skin") rather than long
    INCI dumps.
  · Never clinical, never aggressive. Never uses words like "blast",
    "fight", "attack", "destroy", or "miracle".
  · Cadence reference (samples written by the brand):
    · "A low-pH milk cleanser with fermented rice water, made for
       sensitive skin. Begins every YU.R ritual."
    · "A layered essence with ginseng, niacinamide, and red saffron.
       Sinks into skin in seconds, leaves a quiet, even glow."
    · "A dense, inky balm with black sesame and centella. Rebuilds the
       barrier while you sleep."
    · "A weightless chemical sunscreen with no white cast. Wears under
       makeup, breathes under layers."
`.trim();

// ──────── Public types ─────────────────────────────────────────────────

/** Fields the AI is allowed to polish. Slug/warnings/SEO are excluded. */
export type PolishableField =
  | "name"
  | "shortDescription"
  | "description"
  | "howToUse";

export type PolishInput = {
  /** Which locale's copy is being polished. Affects the prompt. */
  locale: Locale;
  /** Product context — name + INCI help the model edit accurately. */
  productNameEn: string;
  inciList: string;
  /** EN source text per field. On EN tab, currentValues == enValues. */
  enValues: Record<PolishableField, string>;
  /** Current values for the locale being polished (may equal enValues). */
  currentValues: Record<PolishableField, string>;
};

export type PolishOutput = {
  polished: Record<PolishableField, string>;
};

// ──────── Schema ───────────────────────────────────────────────────────

// Each field is independent — empty string is valid for "no change
// needed" so the model can opt-out per field. The wrapper object lets
// generateObject parse a single response.
const polishSchema = z.object({
  name: z.string().max(200),
  shortDescription: z.string().max(400),
  description: z.string().max(4000),
  howToUse: z.string().max(2000),
});

// ──────── Main entry ───────────────────────────────────────────────────

export async function polishProductText(
  input: PolishInput,
): Promise<PolishOutput> {
  const model = getGroqModel();
  if (!model) {
    throw new Error("GROQ_API_KEY is not configured — AI polish unavailable.");
  }

  const isEnglish = input.locale === Locale.EN;
  const localeName: Record<Locale, string> = {
    EN: "English",
    NL: "Dutch",
    FR: "French",
    RU: "Russian",
  };

  const claimGuardrail = `
COSMETIC-CLAIM GUARDRAIL (EU CPNP regulation — non-negotiable):
- NEVER write "anti-aging", "anti-wrinkle", "cures", "treats", "heals",
  "removes wrinkles", "eliminates", "rejuvenates", "lifts the skin", or
  any medical/therapeutic claim.
- DO write sensory verbs: "smooths", "softens", "comforts", "hydrates",
  "brightens the appearance of", "supports the moisture barrier".
- "Brightening" / "firming" as descriptors are OK; "guarantees brighter
  skin in 7 days" is NOT.
- If the source text already contains a forbidden claim, soften it
  rather than preserve it verbatim.
`.trim();

  const htmlRule = `
HTML PRESERVATION:
- description + howToUse are HTML. Preserve the existing tag structure
  (<p>, <ul>, <li>, <strong>, <br>). Rewrite the TEXT inside tags only.
- name + shortDescription are plain text — no HTML tags.
- If the input is empty for a field, the polished output should ALSO be
  empty (return ""). Don't invent copy for fields with no source.
`.trim();

  const system = isEnglish
    ? [
        "You are a copy editor for YU.R, a luxury Korean skincare brand.",
        "Your job: polish the product copy provided by YU.R staff. Fix grammar, sharpen sensory descriptors, match the YU.R voice. NEVER invent ingredient claims that aren't already in the source — you're editing, not authoring.",
        "",
        BRAND_VOICE,
        "",
        claimGuardrail,
        "",
        htmlRule,
      ].join("\n")
    : [
        `You are translating + editing product copy for YU.R into ${localeName[input.locale]}.`,
        "For each field you receive both the English source and the current target-language value. Decide:",
        `  · If the current value is empty: translate the English source into ${localeName[input.locale]}.`,
        `  · If the current value is non-empty: improve it — fix awkward phrasing, match native idioms, preserve meaning.`,
        "",
        "Match the YU.R voice across languages — warm, sensory, never clinical.",
        "",
        BRAND_VOICE,
        "",
        claimGuardrail,
        "",
        htmlRule,
      ].join("\n");

  const sourceBlock = [
    `PRODUCT: ${input.productNameEn}`,
    `INCI: ${input.inciList.trim() || "(no INCI provided)"}`,
    "",
    isEnglish
      ? "FIELDS TO POLISH (English):"
      : `FIELDS TO POLISH (English source → ${localeName[input.locale]} current):`,
  ];

  for (const field of [
    "name",
    "shortDescription",
    "description",
    "howToUse",
  ] as const) {
    sourceBlock.push("", `[${field}]`);
    if (isEnglish) {
      sourceBlock.push(`  ${input.currentValues[field] || "(empty)"}`);
    } else {
      sourceBlock.push(`  EN source: ${input.enValues[field] || "(empty)"}`);
      sourceBlock.push(
        `  Current ${input.locale}: ${input.currentValues[field] || "(empty)"}`,
      );
    }
  }
  sourceBlock.push(
    "",
    "Return polished text for each field. Empty source → empty output.",
  );

  const result = await generateObject({
    model,
    system,
    prompt: sourceBlock.join("\n"),
    schema: polishSchema,
    // Slightly higher than tag classification — copy editing benefits
    // from a touch of variation, but not enough to invent.
    temperature: 0.4,
    maxRetries: 1,
  });

  return {
    polished: {
      name: result.object.name,
      shortDescription: result.object.shortDescription,
      description: result.object.description,
      howToUse: result.object.howToUse,
    },
  };
}
