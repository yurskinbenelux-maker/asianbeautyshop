// ─────────────────────────────────────────────────────────────────────────
// ConciergeQuiz — step-by-step rule-based skin quiz inside the floating orb.
//
// Walks the user through the 7 questions defined in src/lib/ai/quiz.ts,
// POSTs the answers to /api/ai/quiz, then renders the routine the
// server returned. Because the quiz definition is imported directly, the
// client never has to re-declare the question ids — single source of
// truth.
//
// Q3 (secondaryConcerns) is multi-select — chips you can toggle, then
// press Continue. Every other question is single-select and advances
// the moment you tap an option.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { ArrowRight, Check, Loader2, SparklesIcon } from "lucide-react";

import { Link } from "@/i18n/routing";
import { QUIZ } from "@/lib/ai/quiz";
import type { QuizAnswers } from "@/lib/ai/quiz";
import type { RitualPick, RitualStep, QuizBrief } from "@/lib/ai/catalog";
import { formatEur, priceLocale } from "@/lib/utils";

type Phase = "asking" | "loading" | "result" | "error";

type QuizResponse = {
  ritual: RitualPick[];
  brief: QuizBrief;
};

const STEP_KEYS: Record<RitualStep, string> = {
  cleanse: "step_cleanse",
  toner: "step_toner",
  treat: "step_treat",
  cream: "step_cream",
  mask: "step_mask",
  spf: "step_spf",
};

export function ConciergeQuiz({ onClose }: { onClose: () => void }) {
  const t = useTranslations("concierge");
  const locale = useLocale();

  const [phase, setPhase] = useState<Phase>("asking");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [result, setResult] = useState<QuizResponse | null>(null);

  const total = QUIZ.length;
  const current = QUIZ[step];
  const progress = Math.round(
    ((step + (phase === "result" ? 1 : 0)) / total) * 100,
  );

  async function submit(final: QuizAnswers) {
    setPhase("loading");
    try {
      const res = await fetch("/api/ai/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: final, locale }),
      });
      if (!res.ok) throw new Error(`quiz_http_${res.status}`);
      const data = (await res.json()) as QuizResponse;
      setResult(data);
      setPhase("result");
    } catch {
      setPhase("error");
    }
  }

  function pickSingle(questionId: string, optionId: string) {
    const nextAnswers = { ...answers, [questionId]: optionId };
    setAnswers(nextAnswers);
    if (step + 1 < total) {
      setStep(step + 1);
    } else {
      void submit(nextAnswers);
    }
  }

  // Q3 (secondaryConcerns) keeps a Set of selected ids and advances on
  // Continue rather than on tap.
  function toggleMulti(questionId: string, optionId: string) {
    const existing = answers[questionId];
    const arr = Array.isArray(existing) ? existing : [];
    const next = arr.includes(optionId)
      ? arr.filter((id) => id !== optionId)
      : [...arr, optionId];
    setAnswers({ ...answers, [questionId]: next });
  }

  function advanceMulti() {
    if (step + 1 < total) {
      setStep(step + 1);
    } else {
      void submit(answers);
    }
  }

  // ── asking ────────────────────────────────────────────────────────
  if (phase === "asking" && current) {
    const isMulti = current.multi === true;
    const raw = answers[current.id];
    const selectedSet = new Set(
      Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [],
    );

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Progress bar */}
        <div className="h-[2px] bg-ink/10">
          <div
            className="h-full bg-vermilion transition-[width] duration-300"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="eyebrow mb-2">
            {t("quiz_step_indicator", { current: step + 1, total })}
          </div>
          <h3 className="font-display text-[20px] leading-tight text-ink">
            {t(`quiz.${current.id}.question`)}
          </h3>
          {isMulti ? (
            <p className="mt-1 text-[11px] italic text-ink-mid">
              {t("quiz_select_multi_hint")}
            </p>
          ) : null}

          <div className="mt-5 space-y-2">
            {current.options.map((opt) => {
              const active = selectedSet.has(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    isMulti
                      ? toggleMulti(current.id, opt.id)
                      : pickSingle(current.id, opt.id)
                  }
                  className={`group flex w-full items-center justify-between gap-4 border px-4 py-3 text-left transition-colors ${
                    active
                      ? "border-vermilion bg-vermilion/10"
                      : "border-ink/10 bg-white/60 hover:border-vermilion/40 hover:bg-vermilion/5"
                  }`}
                >
                  <span className="text-[13px] leading-snug text-ink">
                    {t(`quiz.${current.id}.options.${opt.id}`)}
                  </span>
                  {isMulti ? (
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center border ${
                        active
                          ? "border-vermilion bg-vermilion text-rice"
                          : "border-ink/30"
                      }`}
                    >
                      {active ? <Check className="h-3 w-3" /> : null}
                    </span>
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-ink-mid transition-colors group-hover:text-vermilion" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Continue button only on multi-select questions. Single-select
              advances on tap so this would just add a click. */}
          {isMulti ? (
            <button
              type="button"
              onClick={advanceMulti}
              className="mt-5 inline-flex items-center gap-2 bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-rice hover:bg-vermilion"
            >
              {t("quiz_continue")}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // ── loading ──────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-vermilion" aria-hidden />
        <div className="text-[13px] text-ink-soft">{t("quiz_building")}</div>
      </div>
    );
  }

  // ── error ────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="flex-1 space-y-3 px-5 py-5">
        <div className="border border-vermilion/30 bg-vermilion/5 px-3 py-3 text-[12px] text-vermilion">
          {t("quiz_error")}
        </div>
        <button
          type="button"
          onClick={() => {
            setAnswers({});
            setStep(0);
            setPhase("asking");
          }}
          className="text-[12px] uppercase tracking-label text-ink-mid underline decoration-vermilion/40 underline-offset-8 hover:text-vermilion"
        >
          {t("quiz_retry")}
        </button>
      </div>
    );
  }

  // ── result ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="h-[2px] bg-ink/10">
        <div className="h-full bg-vermilion" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex items-start gap-2">
          <SparklesIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-vermilion" aria-hidden />
          <div>
            <div className="eyebrow">{t("result_eyebrow")}</div>
            <h3 className="mt-1 font-display text-[18px] leading-tight text-ink">
              {t("result_title")}
            </h3>
          </div>
        </div>

        {/* Tiny diagnosis line — quick "we read your answers as X" reassurance. */}
        {result?.brief ? (
          <p className="mt-3 text-[11px] leading-relaxed text-ink-mid">
            {t("result_diagnosis_label")}:{" "}
            <span className="text-ink">
              {t(`skin_label_${result.brief.skinType}`)}
            </span>{" "}
            · {t("result_diagnosis_goal")}:{" "}
            <span className="text-ink">
              {t(`concern_label_${result.brief.primaryConcern}`)}
            </span>
          </p>
        ) : null}

        <ul className="mt-5 space-y-3">
          {result?.ritual
            .filter((r) => r.product)
            .map((r, idx) => (
              <li
                key={r.step}
                className="flex gap-3 border border-ink/10 bg-white/60 p-3"
              >
                <div className="relative h-20 w-16 flex-shrink-0 bg-ink/5">
                  {r.product?.imageUrl ? (
                    <Image
                      src={r.product.imageUrl}
                      alt={r.product.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-kr text-[11px] text-vermilion">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] uppercase tracking-label text-ink-mid">
                      {t(STEP_KEYS[r.step])}
                    </span>
                  </div>
                  <Link
                    href={`/shop/${r.product!.slug}`}
                    onClick={onClose}
                    className="mt-1 block font-display text-[14px] leading-tight text-ink hover:text-vermilion"
                  >
                    {r.product!.name}
                  </Link>
                  <div className="mt-1 text-[12px] text-ink-mid">
                    {formatEur(r.product!.priceEur, priceLocale(locale))}
                  </div>
                </div>
              </li>
            ))}
        </ul>

        {(!result || result.ritual.every((r) => !r.product)) && (
          <p className="mt-4 text-[12px] italic leading-relaxed text-ink-mid">
            {t("result_empty")}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setAnswers({});
              setStep(0);
              setResult(null);
              setPhase("asking");
            }}
            className="text-[11px] uppercase tracking-label text-ink-mid underline decoration-vermilion/40 underline-offset-8 hover:text-vermilion"
          >
            {t("quiz_retake")}
          </button>
          <Link
            href="/shop"
            onClick={onClose}
            className="bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-rice hover:bg-vermilion"
          >
            {t("result_cta")}
          </Link>
        </div>
      </div>
    </div>
  );
}
