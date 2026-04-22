// ─────────────────────────────────────────────────────────────────────────
// POST /api/ai/quiz — rule-based skin quiz endpoint (Layer 1)
//
// Always available — no API key, no external calls, no rate limit
// beyond what the DB can obviously handle. Input is a simple map of
// questionId → optionId, validated against the quiz definition.
//
// This is what the orb falls back to when:
//   · GROQ_API_KEY is not set
//   · Admin has disabled `ai.enabled`
//   · Groq is rate-limiting us
//   · User picks "take the quiz" rather than free-chat
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { answerQuiz, QuizAnswersSchema } from "@/lib/ai/quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuizBody = {
  answers?: unknown;
  locale?: string;
};

export async function POST(req: Request) {
  let body: QuizBody;
  try {
    body = (await req.json()) as QuizBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = QuizAnswersSchema.safeParse(body.answers);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_answers", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const locale = (body.locale ?? "en").toLowerCase();

  try {
    const result = await answerQuiz({ locale, answers: parsed.data });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ai/quiz] answerQuiz failed", err);
    return NextResponse.json({ error: "quiz_failed" }, { status: 500 });
  }
}
