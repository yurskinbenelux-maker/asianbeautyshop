// ─────────────────────────────────────────────────────────────────────────
// QuizPopup — second on-load popup, fires after the welcome popup is
// finished (closed, dismissed, or skipped). Promotes the skin quiz.
//
// Coordination:
//   • Awaits markWelcomeFinished() via the popup-coordinator helper, so
//     the quiz popup never overlaps the welcome popup.
//   • Once welcome is finished, starts its own configurable delay
//     (default 30s), then fires.
//   • Self-suppresses for 14 days after dismissal — independent cookie
//     from the welcome popup's, so the two have separate frequency caps.
//
// Layout + behaviour mirror the welcome popup: image-left,
// content-right, backdrop click is inert (only X + Escape dismiss),
// scroll lock while open.
//
// Mounted alongside RegisterWelcomePopup in the public layout. Both
// receive their settings from the layout's server fetches.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
// Raw <img>, not next/image — same reason as register-welcome-popup:
// next/image rewrites the src through /_next/image?url=…, mismatching
// the raw URL we preload in the layout <head> AND the JS prefetch
// below. With raw <img> all three (head preload, JS prefetch, render)
// hit the same URL → cache hit → instant paint.
import type { QuizPopupSettings } from "@/lib/queries/quiz-popup";
import { awaitHeroFinished } from "@/lib/marketing/popup-coordinator";

const STORAGE_KEY = "yur:quiz-popup-dismissed";
const SUPPRESS_DAYS = 14;

/** Same suppression list as the welcome popup — auth flows, admin,
 *  cart/checkout. The quiz popup is just as intrusive there. */
const SUPPRESSED_PATH_PATTERNS = [
  /^\/(?:en|nl|fr|ru)?\/?(?:sign-up|sign-in|account)(?:\/|$)/i,
  /^\/(?:en|nl|fr|ru)?\/?(?:cart|checkout)(?:\/|$)/i,
  /^\/admin(?:\/|$)/i,
  /^\/auth(?:\/|$)/i,
  /^\/newsletter(?:\/|$)/i,
  // Don't fire on the quiz page itself — they're already there.
  /^\/(?:en|nl|fr|ru)?\/?quiz(?:\/|$)/i,
];

export function QuizPopup({ config }: { config: QuizPopupSettings }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!config.enabled) return;
    if (SUPPRESSED_PATH_PATTERNS.some((re) => re.test(pathname))) return;

    // Honor 14-day dismissal window — independent from the welcome
    // popup's cookie so the two surfaces have separate caps.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const dismissedAt = Number(raw);
        const elapsedDays =
          (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
        if (Number.isFinite(elapsedDays) && elapsedDays < SUPPRESS_DAYS) {
          return;
        }
      }
    } catch {
      // localStorage unavailable — proceed.
    }

    let timer: number | undefined;
    let cancelled = false;

    // Wait for the HERO popup to be finished (which itself awaits the
    // welcome popup). Chain: welcome → hero → quiz. If any earlier
    // stage was suppressed, the awaiter resolves synchronously and our
    // timer fires after the configured delay.
    awaitHeroFinished().then(() => {
      if (cancelled) return;
      timer = window.setTimeout(
        () => setOpen(true),
        config.delaySecondsAfterWelcome * 1000,
      );
    });

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pathname, config.enabled, config.delaySecondsAfterWelcome]);

  // PREFETCH + DECODE the popup image during idle time so the <img>
  // paints instantly when the modal mounts. Same trick as the
  // welcome popup — without this, the modal chrome appears at the
  // delay tick (welcome finished + ~30s default) but the image
  // arrives 1-2s later on mobile because the layout's <link
  // rel="preload"> is fetchPriority="low" to protect the hero LCP.
  //
  // Steps:
  //   1. new Image().src kicks off the fetch with the SAME raw URL
  //      the <img> below will request → cache hit when React mounts.
  //   2. await .decode() so the decompressed bitmap is also in
  //      memory and paint is a single screen blit.
  //
  // Gated on the open conditions so we don't burn bandwidth
  // prefetching on /quiz or /checkout where the modal would never
  // fire anyway.
  useEffect(() => {
    if (!config.enabled) return;
    if (!config.imageUrl.trim()) return;
    if (SUPPRESSED_PATH_PATTERNS.some((re) => re.test(pathname))) return;
    const img = new window.Image();
    img.src = config.imageUrl;
    void img.decode?.().catch(() => {});
  }, [config.enabled, pathname, config.imageUrl]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* swallow — see above */
    }
  }

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const hasImage = config.imageUrl.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        background: "rgba(20,17,15,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "yur-quiz-popup-fade 600ms ease both",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="yur-quiz-popup-title"
      // No backdrop-click handler — only X + Escape dismiss.
    >
      <div
        className={
          hasImage
            ? "relative grid w-[min(820px,96vw)] grid-cols-1 overflow-hidden border border-ink/10 bg-rice md:grid-cols-2"
            : "relative w-[min(480px,92vw)] overflow-hidden border border-ink/10 bg-rice"
        }
        style={{
          boxShadow:
            "0 20px 60px -20px rgba(20,17,15,0.25), 0 8px 24px -8px rgba(20,17,15,0.18)",
          animation:
            "yur-quiz-popup-rise 700ms cubic-bezier(0.2,0.8,0.2,1) 200ms both",
        }}
      >
        {hasImage && (
          <div className="relative h-44 w-full md:h-auto md:min-h-[480px]">
            {/* Per-viewport object-position — see register-welcome-popup
                for the rationale. Two CSS variables, mobile applied by
                default and desktop swapped in via md: variant. */}
            {/* Raw <img> so the URL matches the head preload + the JS
                prefetch above. By the time this mounts it's a cache
                hit, no network round-trip. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={config.imageUrl}
              alt={config.imageAlt}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover [object-position:var(--yur-pop-pos-mobile)] md:[object-position:var(--yur-pop-pos-desktop)]"
              style={
                {
                  "--yur-pop-pos-desktop":
                    config.imageObjectPositionDesktop || "center",
                  "--yur-pop-pos-mobile":
                    config.imageObjectPositionMobile || "center",
                } as React.CSSProperties
              }
            />
          </div>
        )}

        <div
          className={
            hasImage
              ? "px-6 py-7 md:px-9 md:py-10"
              : "px-7 pb-8 pt-10 md:px-11 md:pb-9 md:pt-12"
          }
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="absolute left-4 top-4 z-10 flex h-7 w-7 items-center justify-center text-ink-mid transition-colors hover:text-ink"
          >
            <svg
              viewBox="0 0 14 14"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M2 2 L12 12 M12 2 L2 12" />
            </svg>
          </button>

          {!hasImage && (
            <svg
              className="pointer-events-none absolute right-0 top-0 h-[110px] w-[110px] opacity-55"
              viewBox="0 0 110 110"
              fill="none"
              stroke="#C8362C"
              strokeWidth="0.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M105 5 Q70 30 50 65 Q42 85 30 102" opacity="0.55" />
              <path d="M88 18 q-3 5 -10 8" opacity="0.7" />
              <path d="M76 30 q-3 5 -10 8" opacity="0.7" />
              <path d="M62 48 q-3 5 -10 8" opacity="0.7" />
              <ellipse cx="92" cy="14" rx="3.5" ry="2" fill="#C8362C" opacity="0.6" />
              <ellipse cx="80" cy="26" rx="3" ry="1.7" fill="#C8362C" opacity="0.5" />
              <ellipse cx="68" cy="42" rx="2.6" ry="1.5" fill="#C8362C" opacity="0.45" />
            </svg>
          )}

          <div className="mb-3 flex items-center gap-2.5 text-[11px] uppercase tracking-label text-vermilion">
            <span className="h-px w-6 bg-current" />
            <span>{config.eyebrow}</span>
          </div>

          <p
            className="m-0 font-display italic text-vermilion"
            style={{
              fontWeight: 400,
              fontSize: hasImage ? "68px" : "88px",
              lineHeight: 0.85,
              letterSpacing: "-0.02em",
            }}
          >
            {config.bigOffer}
          </p>
          <p className="mb-4 mt-1.5 text-[11px] uppercase tracking-label text-ink-mid">
            {config.bigOfferSubtitle}
          </p>

          <h2
            id="yur-quiz-popup-title"
            className={
              hasImage
                ? "m-0 mb-3 font-display text-[24px] font-light leading-[1.15] tracking-tight text-ink"
                : "m-0 mb-3.5 font-display text-[32px] font-light leading-[1.1] tracking-tight text-ink"
            }
            dangerouslySetInnerHTML={{
              __html: renderHeadline(config.headline),
            }}
          />

          <p
            className={
              hasImage
                ? "mb-4 text-[13px] leading-relaxed text-ink-mid"
                : "mb-5 text-[14px] leading-relaxed text-ink-mid"
            }
          >
            {config.body}
          </p>

          {config.bonus1Enabled && (
            <div className="mb-2 flex items-start gap-2 border-l-2 border-vermilion bg-vermilion/5 px-3 py-2.5 text-[12px] leading-snug text-ink">
              {config.bonus1Pct && (
                <span className="font-display italic font-semibold text-vermilion">
                  {config.bonus1Pct}
                </span>
              )}
              <span
                className="text-ink-mid"
                dangerouslySetInnerHTML={{
                  __html: renderInlineMarkdown(config.bonus1Text),
                }}
              />
            </div>
          )}

          {config.bonus2Enabled && (
            <div className="mb-4 flex items-start gap-2 border-l-2 border-sage bg-sage/8 px-3 py-2.5 text-[12px] leading-snug text-ink">
              <svg
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-sage"
                viewBox="0 0 14 14"
                fill="currentColor"
                aria-hidden
              >
                <path d="M7 1 L8.5 5.5 L13 5.5 L9.25 8.25 L10.75 12.75 L7 10 L3.25 12.75 L4.75 8.25 L1 5.5 L5.5 5.5 Z" />
              </svg>
              <span
                className="text-ink-mid"
                dangerouslySetInnerHTML={{
                  __html: renderInlineMarkdown(config.bonus2Text, "sage"),
                }}
              />
            </div>
          )}

          <Link
            href={config.ctaHref}
            onClick={dismiss}
            className="group inline-flex w-full items-center justify-center gap-3 border border-ink bg-ink px-6 py-4 text-[12px] uppercase tracking-label text-rice no-underline transition-colors hover:border-vermilion hover:bg-vermilion"
          >
            <span>{config.ctaLabel}</span>
            <svg
              viewBox="0 0 14 10"
              className="h-2.5 w-3.5 transition-transform group-hover:translate-x-[3px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M1 5 H13 M9 1 L13 5 L9 9" />
            </svg>
          </Link>

          {config.showNoThanks && (
            <button
              type="button"
              onClick={dismiss}
              className="mt-4 w-full bg-transparent p-2 text-center text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
            >
              No thanks
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes yur-quiz-popup-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes yur-quiz-popup-rise {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHeadline(raw: string): string {
  const PLACEHOLDER_OPEN = " EMOPEN ";
  const PLACEHOLDER_CLOSE = " EMCLOSE ";
  const swapped = raw
    .replace(/<em>/gi, PLACEHOLDER_OPEN)
    .replace(/<\/em>/gi, PLACEHOLDER_CLOSE);
  const escaped = escapeHtml(swapped);
  return escaped
    .split(PLACEHOLDER_OPEN)
    .join('<em class="not-italic font-display italic text-vermilion" style="font-weight:400">')
    .split(PLACEHOLDER_CLOSE)
    .join("</em>");
}

function renderInlineMarkdown(raw: string, accent?: "sage"): string {
  const escaped = escapeHtml(raw);
  const cls =
    accent === "sage"
      ? 'class="text-sage" style="color:#5A6B4E;font-weight:500"'
      : 'class="text-ink" style="color:#14110F;font-weight:500"';
  return escaped.replace(
    /\*\*(.+?)\*\*/g,
    `<strong ${cls}>$1</strong>`,
  );
}
