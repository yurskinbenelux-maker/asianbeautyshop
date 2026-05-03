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
//   · Llama 4 Scout 17B is fast and gives us the most token headroom
//     of any free-tier model
//
// Swapping providers later is a two-line change — import a different
// `createX` from `@ai-sdk/*` and point at its model id. The routes
// below only know about `LanguageModelV1`, the vendor-neutral shape.
// ─────────────────────────────────────────────────────────────────────────

import { createGroq } from "@ai-sdk/groq";
import type { LanguageModelV1 } from "ai";

// Model id — kept here so we can swap models by editing one string.
//
// Llama 4 Scout (17B, 16-expert MoE): the right pick for the orb on
// Groq's free tier. Compared to llama-3.3-70b-versatile we used to use:
//   · TPM 30K vs 12K  (2.5× the per-minute headroom)
//   · TPD 500K vs 100K (5× the daily ceiling — ~300 chats/day vs ~60)
//   · Same RPD (1K) — the request count is never the bottleneck
//   · Same tool-calling support, no code changes elsewhere
//   · Multimodal — opens the door to "show me your skin concern" photo
//     uploads later without another model swap
const GROQ_MODEL_ID = "meta-llama/llama-4-scout-17b-16e-instruct";

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
