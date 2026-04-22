// ─────────────────────────────────────────────────────────────────────────
// POST /api/ai/chat — streaming chat endpoint (Layer 2)
//
// Pipeline:
//   1. Gate on the admin-editable `enabled` toggle (ai settings).
//   2. Gate on GROQ_API_KEY being present.
//   3. Rate-limit per-IP (simple in-memory token bucket, resets each
//      process lifetime — good enough for a free-tier assistant).
//   4. Stream `streamText()` with tool calling to the catalog.
//
// Failure modes degrade softly:
//   · No key          → 501, client shows "assistant offline"
//   · Admin disabled  → 503, client hides the chat tab entirely
//   · Rate limited    → 429, client swaps to quiz mode
//   · LLM error       → stream ends, client shows error bubble
// ─────────────────────────────────────────────────────────────────────────

import { streamText, type CoreMessage } from "ai";
import { NextResponse } from "next/server";
import { readSetting } from "@/lib/settings";
import { getGroqModel } from "@/lib/ai/groq";
import { buildAiTools } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";

// Edge runtime would be ideal for streaming, but the `ai` package pulls
// in Prisma through the tool execute functions, and Prisma doesn't run
// on the Edge. Node runtime is fine — Hostinger Node.js supports it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Tiny per-IP token bucket ─────────────────────────────────────────
// Groq's own rate limit (1000 RPD) is the real ceiling, but this layer
// stops a single visitor from burning through it in five minutes.
// Resets every 10 minutes per IP.
type BucketEntry = { tokens: number; resetAt: number };
const BUCKETS = new Map<string, BucketEntry>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RATE_LIMIT_REQUESTS = 15;              // 15 turns per 10 min per IP

function rateLimitOk(ip: string): boolean {
  const now = Date.now();
  const existing = BUCKETS.get(ip);
  if (!existing || existing.resetAt <= now) {
    BUCKETS.set(ip, { tokens: RATE_LIMIT_REQUESTS - 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (existing.tokens <= 0) return false;
  existing.tokens -= 1;
  return true;
}

function getIp(req: Request): string {
  // Hostinger sits behind Cloudflare-style proxies; honour the forwarded
  // header if present. Fallback is "unknown" which still rate-limits the
  // whole unknown-IP bucket together (safer default).
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// ── Request body shape ───────────────────────────────────────────────
type ChatBody = {
  messages: CoreMessage[];
  locale?: string;
};

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages_required" }, { status: 400 });
  }

  // 1. Gate on admin toggle.
  const settings = await readSetting("ai");
  if (!settings.enabled) {
    return NextResponse.json({ error: "assistant_disabled" }, { status: 503 });
  }

  // 2. Gate on Groq key.
  const model = getGroqModel();
  if (!model) {
    return NextResponse.json({ error: "groq_unavailable" }, { status: 501 });
  }

  // 3. Rate limit.
  if (!rateLimitOk(getIp(req))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // 4. Stream.
  const locale = (body.locale ?? "en").toLowerCase();
  const system = buildSystemPrompt(settings, locale);

  const result = streamText({
    model,
    system,
    messages: body.messages,
    tools: buildAiTools(locale),
    maxTokens: settings.maxResponseTokens > 0 ? settings.maxResponseTokens : undefined,
    // Let the model call tools in multiple hops (search → then build a
    // ritual → then recommend). 4 is plenty for a skincare Q&A.
    maxSteps: 4,
    temperature: 0.6,
    // If the model errors mid-stream, surface a user-facing bubble via
    // onError rather than a hanging connection.
    onError: ({ error }) => {
      // eslint-disable-next-line no-console
      console.error("[ai/chat] stream error", error);
    },
  });

  // toDataStreamResponse() is the format useChat() on the client expects.
  return result.toDataStreamResponse();
}
