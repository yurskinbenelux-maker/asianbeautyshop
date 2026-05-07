// ─────────────────────────────────────────────────────────────────────────
// Email copy polish — Groq-backed rewriter for the /admin/emails editor.
//
// Mirrors `polishProductText` but tuned for transactional email copy:
// brand voice is calm, deliberate, minimal — "with care", not "Hi there!".
// Returns the polished text directly (no JSON wrapper) since email
// fields are single strings, not multi-field objects like products.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { Locale } from "@prisma/client";
import { generateText } from "ai";
import { getGroqModel } from "./groq";

const LOCALE_NAME: Record<Locale, string> = {
  EN: "English",
  NL: "Dutch",
  FR: "French",
  RU: "Russian",
};

export type PolishEmailInput = {
  /** The locale of the value being polished. The output stays in this language. */
  locale: Locale;
  /** Field's human label (e.g. "Lede paragraph") so the model knows what
   *  kind of voice it's editing. */
  fieldLabel: string;
  /** The current value Sofia typed. */
  current: string;
};

/**
 * Rewrite a single email-copy string in the same locale, polishing for
 * the Asian Beauty Shop brand voice (luxury skincare, calm and deliberate, minimal
 * exclamation, no emoji). Throws when GROQ_API_KEY is missing.
 */
export async function polishEmailText(
  input: PolishEmailInput,
): Promise<string> {
  const model = getGroqModel();
  if (!model) {
    throw new Error("GROQ_API_KEY is not configured — AI polish unavailable.");
  }

  const targetLanguage = LOCALE_NAME[input.locale];

  const system = [
    "You are an editor for a luxury Korean-skincare e-commerce brand named Asian Beauty Shop.",
    "Your job is to polish a single piece of transactional email copy without changing its meaning.",
    "Rules:",
    "- Keep the same language. Output language: " + targetLanguage + ".",
    "- Match a calm, deliberate, minimal voice — never enthusiastic, never marketing-y.",
    "- No emoji. No exclamation marks unless the original had one.",
    "- Keep the same length range as the original (within 20%). Don't pad.",
    "- Don't introduce facts that weren't in the original.",
    "- If the original contains placeholders like {firstName} or {orderNumber}, KEEP THEM EXACTLY.",
    "- Output ONLY the polished text. No quotes, no commentary, no labels.",
  ].join("\n");

  const user = [
    `Field: ${input.fieldLabel}`,
    `Current value:`,
    input.current,
    ``,
    `Polished version:`,
  ].join("\n");

  const result = await generateText({
    model,
    system,
    prompt: user,
    temperature: 0.6,
    maxTokens: 600,
  });

  return result.text.trim();
}
