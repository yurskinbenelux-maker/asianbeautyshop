// ─────────────────────────────────────────────────────────────────────────
// Groq client factory (Layer 2)
//
// Single source of truth for the AI SDK provider. If GROQ_API_KEY is
// missing OR the admin has disabled the orb, `getGroqModel()` returns
// null and callers fall back to Layer 1 (the rule-based quiz).
//
// Why Groq specifically:
//   · Free tier with no credit card (1,000 RPD / 30 RPM)
//   · Supports tool calling, which we need for catalog lookups
//   · Llama 3.3 70B is fast enough to feel snappy on the orb
//
// Swapping providers later is a two-line change — import a different
// `createX` from `@ai-sdk/*` and point at its model id. The routes
// below only know about `LanguageModelV1`, the vendor-neutral shape.
// ─────────────────────────────────────────────────────────────────────────

import { createGroq } from "@ai-sdk/groq";
import type { LanguageModelV1 } from "ai";

// Model id — kept here so we can swap models by editing one string.
// Llama 3.3 70B: free tier, supports parallel tool calling, 128K context.
const GROQ_MODEL_ID = "llama-3.3-70b-versatile";

/**
 * Returns a ready-to-use Groq model, or null if Groq isn't configured.
 *
 * Callers should use this pattern:
 *
 *     const model = getGroqModel();
 *     if (!model) return fallbackToRuleBased();
 *     const stream = streamText({ model, ... });
 */
export function getGroqModel(): LanguageModelV1 | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const groq = createGroq({ apiKey });
  return groq(GROQ_MODEL_ID);
}

/** True if the env is configured for LLM use (doesn't contact Groq). */
export function hasGroqKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}
