// ─────────────────────────────────────────────────────────────────────────
// RegisterWelcomePopup — homepage on-load modal that offers a discount on
// the first order in exchange for creating an account.
//
// Two-column layout: image on the LEFT, copy + CTA on the RIGHT (mobile
// stacks image on top, content below). Every word and the image itself
// is editable from /admin/marketing/welcome-popup — the layout reads
// the Setting row server-side and passes the resolved config down here.
//
// Behaviour:
//   · Mounts on every page but only triggers on /, /en, /nl, /fr, /ru —
//     never on /sign-up, /sign-in, /admin, /cart, /checkout, /account.
//   · 3-second delay after first paint so the hero gets a moment to
//     breathe before the modal lands.
//   · 14-day suppression cookie on dismissal, on submit-click, or on
//     close. Stored in localStorage — Sofia's analytics intentionally
//     not involved, no server hit.
//   · Hidden entirely if the user is already signed in (passed in by
//     the layout) — no point pestering an existing customer.
//   · Dismissal via the X button or the Escape key only. Clicking the
//     dim backdrop does NOT close the popup — Sofia's call: a stray
//     click on the page outside the modal shouldn't cost us the offer.
//   · Honors the master kill-switch from Sofia's admin (config.enabled).
//
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { WelcomePopupSettings } from "@/lib/queries/welcome-popup";
import { markWelcomeFinished } from "@/lib/marketing/popup-coordinator";

const STORAGE_KEY = "yur:welcome-popup-dismissed";
const SUPPRESS_DAYS = 14;

/** Routes where the popup should NEVER fire — auth flows, admin, and
 *  any conversion-funnel page where it would be intrusive. */
const SUPPRESSED_PATH_PATTERNS = [
  /^\/(?:en|nl|fr|ru)?\/?(?:sign-up|sign-in|account)(?:\/|$)/i,
  /^\/(?:en|nl|fr|ru)?\/?(?:cart|checkout)(?:\/|$)/i,
  /^\/admin(?:\/|$)/i,
  /^\/auth(?:\/|$)/i,
  /^\/newsletter(?:\/|$)/i,
];

export function RegisterWelcomePopup({
  isSignedIn,
  config,
}: {
  isSignedIn: boolean;
  config: WelcomePopupSettings;
}) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Bail conditions — order matters, cheapest checks first. Each
    // bail path also calls markWelcomeFinished() so the quiz popup's
    // coordinator awaiter resolves and its own delay timer can start.
    if (!config.enabled) {
      markWelcomeFinished();
      return;
    }
    if (isSignedIn) {
      markWelcomeFinished();
      return;
    }
    if (SUPPRESSED_PATH_PATTERNS.some((re) => re.test(pathname))) {
      markWelcomeFinished();
      return;
    }

    // Honor 14-day dismissal window.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const dismissedAt = Number(raw);
        const elapsedDays =
          (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
        if (Number.isFinite(elapsedDays) && elapsedDays < SUPPRESS_DAYS) {
          markWelcomeFinished();
          return;
        }
      }
    } catch {
      // localStorage unavailable (private mode in older Safaris) —
      // proceed to show the popup. Worst case: shown every visit.
    }

    const timer = window.setTimeout(
      () => setOpen(true),
      config.delaySeconds * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [isSignedIn, pathname, config.enabled, config.delaySeconds]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* see above */
    }
    // Tell the quiz popup it's safe to start its own delay timer.
    markWelcomeFinished();
  }

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Close on Escape — accessibility default.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  // Decide layout — if no image, fall back to single-column. Sofia can
  // always blank the image URL in admin to revert the layout.
  const hasImage = config.imageUrl.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        background: "rgba(20,17,15,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "yur-popup-fade 600ms ease both",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="yur-welcome-popup-title"
      // NB: deliberately no onClick handler — the dim backdrop must not
      // dismiss the popup. Only the X button and Escape do (Sofia's call,
      // to stop a stray click costing us the offer).
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
            "yur-popup-rise 700ms cubic-bezier(0.2,0.8,0.2,1) 200ms both",
        }}
      >
        {/* ── LEFT column: image (only when imageUrl is set) ────────
            Mobile: short banner (h-44 = 176px) so the popup is read
            as a card, not a half-screen ad. Desktop: square left
            column at the typical mega-menu height. */}
        {hasImage && (
          <div className="relative h-44 w-full md:h-auto md:min-h-[480px]">
            <Image
              src={config.imageUrl}
              alt={config.imageAlt}
              fill
              sizes="(max-width: 768px) 100vw, 410px"
              className="object-cover"
              priority
            />
          </div>
        )}

        {/* ── RIGHT column: content ─────────────────────────────────
            Mobile padding is tighter so the headline + bonus blocks +
            CTA all fit above the fold on a phone. Desktop keeps the
            generous editorial padding. */}
        <div
          className={
            hasImage
              ? "px-6 py-7 md:px-9 md:py-10"
              : "px-7 pb-8 pt-10 md:px-11 md:pb-9 md:pt-12"
          }
        >
          {/* close X — placed inside content column so it's reachable
              on both layouts. Top-left for symmetry with the existing
              design language. */}
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

          {/* hand-drawn peony branch — kept on the single-column
              variant where there's no left image. With image present
              it would compete visually, so we hide it. */}
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
              <path d="M50 65 q-3 5 -10 8" opacity="0.7" />
              <ellipse cx="92" cy="14" rx="3.5" ry="2" fill="#C8362C" opacity="0.6" />
              <ellipse cx="80" cy="26" rx="3" ry="1.7" fill="#C8362C" opacity="0.5" />
              <ellipse cx="68" cy="42" rx="2.6" ry="1.5" fill="#C8362C" opacity="0.45" />
              <ellipse cx="55" cy="60" rx="2.2" ry="1.3" fill="#C8362C" opacity="0.4" />
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
            id="yur-welcome-popup-title"
            className={
              hasImage
                ? "m-0 mb-3 font-display text-[24px] font-light leading-[1.15] tracking-tight text-ink"
                : "m-0 mb-3.5 font-display text-[32px] font-light leading-[1.1] tracking-tight text-ink"
            }
            // Allow Sofia's <em>Asian Beauty Shop</em> markup through. Allowlisted at
            // save time (Zod schema), so this is a small controlled
            // surface — admin-edited content only, never user-supplied.
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

          <p className="mt-4 text-center text-[12px] text-ink-mid">
            Already a member?{" "}
            <Link
              href="/en/sign-in"
              onClick={dismiss}
              className="text-ink underline underline-offset-[3px]"
            >
              Sign in
            </Link>
          </p>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-mid">
            By registering you agree to our{" "}
            <Link href="/en/legal/terms" className="text-ink underline underline-offset-[3px]">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/en/legal/privacy" className="text-ink underline underline-offset-[3px]">
              privacy policy
            </Link>
            .
          </p>

          {config.showNoThanks && (
            <button
              type="button"
              onClick={dismiss}
              className="mt-3 w-full bg-transparent p-2 text-center text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
            >
              No thanks
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes yur-popup-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes yur-popup-rise {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tiny, controlled HTML renderers for admin-edited fields.
//
// • renderHeadline — passes <em>…</em> through verbatim, escapes everything
//   else. Used by the H2 only.
// • renderInlineMarkdown — converts **bold** to <strong>, escapes the rest.
//   Used in the bonus blocks.
//
// Both are admin-content surfaces (only Sofia and other admin editors
// can write the text). The Zod schema caps lengths and trims whitespace
// at save time. We escape the input first then re-insert the allowed
// tags so a stray "<" in body copy can't break out of the box.
// ─────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHeadline(raw: string): string {
  // Allowlist: <em>...</em> with optional whitespace. Anything else is
  // escaped. Use a placeholder swap so we don't accidentally match
  // escaped &lt;em&gt; sequences.
  const PLACEHOLDER_OPEN = " EMOPEN ";
  const PLACEHOLDER_CLOSE = " EMCLOSE ";
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
  // First escape, then turn **xxx** into <strong>xxx</strong> with the
  // appropriate accent color.
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
