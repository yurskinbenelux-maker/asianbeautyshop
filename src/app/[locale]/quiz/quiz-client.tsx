// ─────────────────────────────────────────────────────────────────────────
// /[locale]/quiz — client-side stepper + result.
//
// Mirrors the flow of ConciergeQuiz (the small orb version) but scaled to
// editorial size: question text is display-sized, options are cards with
// left-aligned bullet indicators, and the result is shown as a grid of
// product cards with direct add-to-cart buttons.
//
// POSTs to /api/ai/quiz — the same rule-based endpoint the orb uses, so
// this page stays functional even when GROQ_API_KEY isn't set.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowRight, ArrowLeft, Loader2, RotateCcw } from "lucide-react";

import { QUIZ } from "@/lib/ai/quiz";
import type { QuizAnswers } from "@/lib/ai/quiz";
import type { RitualPick } from "@/lib/ai/catalog";
import { RitualResult } from "./result-card";

type Phase = "asking" | "loading" | "result" | "error";

type QuizResponse = {
  ritual: RitualPick[];
  inferred: {
    skinTypeSlugs: string[];
    concernSlugs: string[];
  };
};

export function QuizClient({ locale }: { locale: string }) {
  const t = useTranslations("quizPage");
  const tConcierge = useTranslations("concierge");
  const uiLocale = useLocale();

  const [phase, setPhase] = useState<Phase>("asking");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [result, setResult] = useState<QuizResponse | null>(null);

  const total = QUIZ.length;
  const current = QUIZ[step];
  const progressPct =
    phase === "result" ? 100 : Math.round((step / total) * 100);

  async function submit(final: QuizAnswers) {
    setPhase("loading");
    try {
      const res = await fetch("/api/ai/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: final, locale: uiLocale }),
      });
      if (!res.ok) throw new Error(`quiz_http_${res.status}`);
      const data = (await res.json()) as QuizResponse;
      setResult(data);
      setPhase("result");
    } catch {
      setPhase("error");
    }
  }

  function pickOption(questionId: string, optionId: string) {
    const nextAnswers: QuizAnswers = { ...answers, [questionId]: optionId };
    setAnswers(nextAnswers);
    if (step + 1 < total) {
      setStep(step + 1);
    } else {
      void submit(nextAnswers);
    }
  }

  function goBack() {
    if (step > 0) setStep(step - 1);
  }

  function retake() {
    setAnswers({});
    setResult(null);
    setStep(0);
    setPhase("asking");
  }

  // ── asking ─────────────────────────────────────────────────────────
  if (phase === "asking" && current) {
    const selectedForThisStep = answers[current.id];
    return (
      <div className="border border-ink/10 bg-white/70 backdrop-blur-sm">
        {/* Progress bar */}
        <div className="h-[2px] bg-ink/10">
          <div
            className="h-full bg-vermilion transition-[width] duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="px-6 py-8 md:px-12 md:py-12">
          <div className="flex items-center justify-between">
            <div className="eyebrow">
              {tConcierge("quiz_step_indicator", {
                current: step + 1,
                total,
              })}
            </div>
            {step > 0 ? (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-mid hover:text-vermilion"
              >
                <ArrowLeft className="h-3 w-3" aria-hidden />
                {t("back")}
              </button>
            ) : null}
          </div>

          <h2 className="mt-4 font-display text-[26px] leading-tight text-ink md:text-[34px]">
            {tConcierge(`quiz.${current.id}.question`)}
          </h2>

          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {current.options.map((opt) => {
              const isActive = selectedForThisStep === opt.id;
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => pickOption(current.id, opt.id)}
                    className={`group flex w-full items-center justify-between gap-4 border px-5 py-4 text-left transition-colors ${
                      isActive
                        ? "border-vermilion bg-vermilion/5"
                        : "border-ink/15 bg-white/60 hover:border-vermilion/50 hover:bg-vermilion/5"
                    }`}
                  >
                    <span className="text-[14px] leading-snug text-ink">
                      {tConcierge(`quiz.${current.id}.options.${opt.id}`)}
                    </span>
                    <ArrowRight
                      className={`h-4 w-4 flex-shrink-0 transition-colors ${
                        isActive
                          ? "text-vermilion"
                          : "text-ink-mid group-hover:text-vermilion"
                      }`}
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-8 text-[12px] italic leading-relaxed text-ink-mid">
            {t("privacy_note")}
          </p>
        </div>
      </div>
    );
  }

  // ── loading ────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 border border-ink/10 bg-white/70 px-6 py-24 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-vermilion" aria-hidden />
        <div className="font-display text-[20px] text-ink">
          {tConcierge("quiz_building")}
        </div>
        <div className="max-w-sm text-[13px] leading-relaxed text-ink-mid">
          {t("loading_hint")}
        </div>
      </div>
    );
  }

  // ── error ──────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="border border-vermilion/30 bg-vermilion/5 px-6 py-10 text-center">
        <div className="font-display text-[20px] text-ink">
          {tConcierge("quiz_error")}
        </div>
        <button
          type="button"
          onClick={retake}
          className="mt-6 inline-flex items-center gap-2 bg-ink px-5 py-3 text-[11px] uppercase tracking-label text-rice hover:bg-vermilion"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {tConcierge("quiz_retry")}
        </button>
      </div>
    );
  }

  // ── result ─────────────────────────────────────────────────────────
  return (
    <div>
      {/* Keep the progress bar filled so the transition feels completed */}
      <div className="h-[2px] bg-ink/10">
        <div className="h-full bg-vermilion" style={{ width: "100%" }} />
      </div>

      <RitualResult
        ritual={result?.ritual ?? []}
        locale={locale}
        onRetake={retake}
      />
    </div>
  );
}
