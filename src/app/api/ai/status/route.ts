// ─────────────────────────────────────────────────────────────────────────
// GET /api/ai/status — small unauthenticated status probe
//
// Tells the client which modes are available so the orb can render
// itself accurately on first paint:
//
//   · enabled        admin hasn't switched the bot off
//   · chatAvailable  GROQ_API_KEY is set AND enabled (Layer 2)
//   · quizAvailable  always true when enabled (Layer 1)
//
// Cheap read (one settings row + env var lookup), and deliberately
// doesn't leak the prompt or key itself.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { readSetting } from "@/lib/settings";
import { hasGroqKey } from "@/lib/ai/groq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await readSetting("ai");
  const enabled = settings.enabled;

  return NextResponse.json(
    {
      enabled,
      assistantName: settings.assistantName,
      chatAvailable: enabled && hasGroqKey(),
      quizAvailable: enabled,
    },
    { status: 200 },
  );
}
