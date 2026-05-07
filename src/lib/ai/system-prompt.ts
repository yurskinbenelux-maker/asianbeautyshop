// ─────────────────────────────────────────────────────────────────────────
// System-prompt builder for the AI skin concierge
//
// The admin sets the "personality" portion of the prompt from
// /admin/settings/ai (the textarea named `systemPrompt`). This module
// wraps that admin copy with a non-negotiable block that enforces:
//
//   · only recommend products that tool-calls return (no hallucinations)
//   · stay in the requested locale
//   · refuse out-of-scope topics (politics, medical diagnosis, etc.)
//
// Keeping the enforcement block separate from the admin textarea means
// Elie can change tone freely without accidentally deleting the rules
// that keep the bot on-topic.
// ─────────────────────────────────────────────────────────────────────────

import type { AiSettings } from "@/lib/settings";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  nl: "Dutch",
  fr: "French",
  ru: "Russian",
};

export function buildSystemPrompt(
  settings: AiSettings,
  locale: string,
): string {
  const languageName = LOCALE_LABELS[locale] ?? "English";

  const rules = [
    `Respond in ${languageName}.`,
    "Only recommend products that came back from a searchCatalog, getProduct, or buildRitual tool call during this conversation. Never invent SKUs or brands.",
    "When you cite a product, include its name exactly as returned; do not translate or shorten it.",
    "Keep responses short — 2 to 4 short paragraphs, or a short list. This is a chat orb, not an article.",
    "If asked for medical, prescription, or diagnosis advice, gently decline and suggest consulting a dermatologist.",
    "If asked about topics unrelated to skincare, politely redirect back to the ritual.",
    "Never discuss competitors or products not stocked by Asian Beauty Shop.",
    "If no tool call returns a suitable product, say so honestly instead of improvising.",
  ];

  return [
    (settings.assistantName || "the skin concierge") + " — Asian Beauty Shop",
    "",
    settings.systemPrompt.trim(),
    "",
    "Non-negotiable rules:",
    ...rules.map((r) => `- ${r}`),
  ].join("\n");
}
