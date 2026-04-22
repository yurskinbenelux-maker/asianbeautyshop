// ─────────────────────────────────────────────────────────────────────────
// ConciergeShell — client orchestrator
//
// Owns:
//   · The floating seal button (breathing, pulse rings)
//   · The glass chat panel (open/close animation)
//   · Mode switching: "picker" → "quiz" or "chat"
//   · Backdrop dismiss
//
// Does NOT own:
//   · Quiz state/logic — delegated to <ConciergeQuiz />
//   · Chat streaming — delegated to <ConciergeChat />
//
// Splitting those out means each screen is testable in isolation and
// the shell stays under 150 lines.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { X, Sparkles, MessageCircle, ArrowLeft } from "lucide-react";

import { ConciergeQuiz } from "./concierge-quiz";
import { ConciergeChat } from "./concierge-chat";

type Mode = "picker" | "quiz" | "chat";

export function ConciergeShell({
  assistantName,
  chatAvailable,
}: {
  assistantName: string;
  chatAvailable: boolean;
}) {
  const t = useTranslations("concierge");
  const [open, setOpen] = useState(false);
  // If chat isn't available, we skip the picker and drop straight into
  // the quiz — the user has one option, no point making them click twice.
  const [mode, setMode] = useState<Mode>(chatAvailable ? "picker" : "quiz");

  const close = () => {
    setOpen(false);
    // Reset mode after the exit animation finishes so re-opening shows
    // the picker again, not whatever the user last abandoned.
    setTimeout(() => setMode(chatAvailable ? "picker" : "quiz"), 320);
  };

  return (
    <>
      {/* ── orb ─────────────────────────────────────────────────── */}
      <button
        type="button"
        aria-label={t("open")}
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-none bg-vermilion text-rice ink-drop transition-transform hover:scale-105 active:scale-95 md:bottom-8 md:right-8"
      >
        <span className="absolute inset-0 animate-pulse_ring bg-vermilion/40" aria-hidden />
        <span
          className="absolute inset-0 animate-pulse_ring bg-vermilion/30"
          aria-hidden
          style={{ animationDelay: "1.2s" }}
        />
        <span className="relative animate-breathe font-kr text-[22px] leading-none">
          印
        </span>
      </button>

      {/* ── panel ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="glass fixed bottom-24 right-6 z-50 flex max-h-[min(640px,calc(100vh-8rem))] w-[min(92vw,420px)] flex-col shadow-card md:bottom-28 md:right-8"
            role="dialog"
            aria-label={assistantName}
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <div className="flex items-center gap-3">
                {mode !== "picker" && chatAvailable && (
                  <button
                    type="button"
                    onClick={() => setMode("picker")}
                    aria-label={t("back")}
                    className="text-ink-mid transition-colors hover:text-vermilion"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <span className="seal">印</span>
                <div>
                  <div className="font-display text-[16px] leading-none text-ink">
                    {assistantName}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-caps text-ink-mid">
                    {mode === "quiz"
                      ? t("mode_quiz_label")
                      : mode === "chat"
                        ? t("mode_chat_label")
                        : "YU.R"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t("close")}
                className="text-ink-mid hover:text-vermilion"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* body — one of three modes */}
            {mode === "picker" && (
              <ModePicker onPickQuiz={() => setMode("quiz")} onPickChat={() => setMode("chat")} />
            )}
            {mode === "quiz" && <ConciergeQuiz onClose={close} />}
            {mode === "chat" && <ConciergeChat />}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ModePicker — first screen when both quiz and chat are available.
// Two big targets with visible affordance and brief helper text so the
// user doesn't have to guess what happens next.
// ─────────────────────────────────────────────────────────────────────────

function ModePicker({
  onPickQuiz,
  onPickChat,
}: {
  onPickQuiz: () => void;
  onPickChat: () => void;
}) {
  const t = useTranslations("concierge");
  return (
    <div className="flex-1 space-y-3 px-5 py-5">
      <p className="text-[13px] leading-relaxed text-ink-soft">
        {t("greeting")}
      </p>

      <button
        type="button"
        onClick={onPickQuiz}
        className="group flex w-full items-start gap-4 border border-ink/10 bg-white/60 px-4 py-4 text-left transition-colors hover:border-vermilion/40 hover:bg-vermilion/5"
      >
        <Sparkles
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-vermilion"
          aria-hidden
        />
        <span>
          <span className="block font-display text-[15px] leading-tight text-ink">
            {t("mode_quiz_title")}
          </span>
          <span className="mt-1 block text-[12px] leading-relaxed text-ink-mid">
            {t("mode_quiz_hint")}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onPickChat}
        className="group flex w-full items-start gap-4 border border-ink/10 bg-white/60 px-4 py-4 text-left transition-colors hover:border-vermilion/40 hover:bg-vermilion/5"
      >
        <MessageCircle
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-vermilion"
          aria-hidden
        />
        <span>
          <span className="block font-display text-[15px] leading-tight text-ink">
            {t("mode_chat_title")}
          </span>
          <span className="mt-1 block text-[12px] leading-relaxed text-ink-mid">
            {t("mode_chat_hint")}
          </span>
        </span>
      </button>
    </div>
  );
}
