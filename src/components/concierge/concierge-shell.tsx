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

import { useEffect, useRef, useState } from "react";
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

  // Refs for WCAG focus management:
  //   · orbRef — where to return focus on close (WCAG 2.4.3 Focus Order)
  //   · panelRef — where to land focus on open (WCAG 2.4.11 Focus Not Obscured)
  const orbRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    // Reset mode after the exit animation finishes so re-opening shows
    // the picker again, not whatever the user last abandoned.
    setTimeout(() => setMode(chatAvailable ? "picker" : "quiz"), 320);
    // Return focus to the orb so keyboard users don't lose their place.
    setTimeout(() => orbRef.current?.focus(), 340);
  };

  // Escape-to-close — required for any modal-like surface per 2.1.2.
  // Tab-wraparound focus trap — when the panel is open, focus must not
  // escape into the page behind it (WCAG 2.4.3 Focus Order + ARIA APG
  // dialog pattern). We compute the tabbable descendants at keydown
  // time rather than caching them, because the concierge can swap
  // between picker/quiz/chat modes which changes the tab stops.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;

      // All focusable descendants. Skip disabled + aria-hidden subtrees.
      const nodes = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("aria-hidden"));

      if (nodes.length === 0) {
        // Nothing tabbable — keep focus on the panel itself so Tab
        // can't escape.
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        // Shift+Tab from the first element (or the dialog container
        // itself) → wrap to last.
        if (active === first || active === panel || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab from the last element → wrap to first.
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // close is stable enough; refs are excluded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Move focus into the panel when it opens so screen readers announce
  // the dialog context immediately.
  useEffect(() => {
    if (open) {
      // Timeout lets the entry animation paint first — focusing mid-
      // animation produces a ghost focus ring in some browsers.
      const id = setTimeout(() => panelRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Lock body scroll while the panel is open. Without this, on mobile
  // the page behind the floating panel still momentum-scrolls when the
  // user swipes inside the chat — feels janky and you can lose your
  // reading position. Pattern matches the other overlays in the app.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* ── orb ─────────────────────────────────────────────────── */}
      <button
        ref={orbRef}
        type="button"
        aria-label={t("open")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        // Bottom offset uses max(static, safe-area-inset-bottom) so on
        // notched iPhones the orb clears the home-indicator strip
        // (~34px) instead of being half-eaten by it.
        className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 z-50 grid h-14 w-14 place-items-center rounded-none bg-vermilion text-rice ink-drop transition-transform hover:scale-105 active:scale-95 md:bottom-[max(2rem,env(safe-area-inset-bottom))] md:right-8"
      >
        <span className="absolute inset-0 animate-pulse_ring bg-vermilion/40" aria-hidden />
        <span
          className="absolute inset-0 animate-pulse_ring bg-vermilion/30"
          aria-hidden
          style={{ animationDelay: "1.2s" }}
        />
        {/* AI orb glyph — Sparkles is the universal "smart assistant"
            mark; replaces the previous CJK 印 (stamp) character to keep
            the brand wordmark-only post-2026-04 brand sweep. */}
        <Sparkles
          className="relative h-5 w-5 animate-breathe"
          aria-hidden
          strokeWidth={1.6}
        />
      </button>

      {/* ── panel ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            // Panel sits well above the orb. Add safe-area into the
            // bottom offset so on iPhones it lifts above the home bar
            // (otherwise the panel's bottom edge collides with the orb's
            // new safe-area lifted position).
            className="glass fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-6 z-50 flex max-h-[min(640px,calc(100vh-8rem))] w-[min(92vw,420px)] flex-col shadow-card outline-none md:bottom-[calc(7rem+env(safe-area-inset-bottom))] md:right-8"
            role="dialog"
            aria-modal="true"
            aria-label={assistantName}
            tabIndex={-1}
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
                {/* Avatar pip in the chat header — same Sparkles motif
                    as the floating orb so the icon language stays
                    consistent. Vermilion background matches the orb. */}
                <span
                  className="inline-flex h-7 w-7 items-center justify-center bg-vermilion text-rice"
                  aria-hidden
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />
                </span>
                <div>
                  <div className="font-display text-[16px] leading-none text-ink">
                    {assistantName}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-caps text-ink-mid">
                    {mode === "quiz"
                      ? t("mode_quiz_label")
                      : mode === "chat"
                        ? t("mode_chat_label")
                        : "Asian Beauty Shop"}
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
