// ─────────────────────────────────────────────────────────────────────────
// RegisterWelcomePopup — homepage on-load modal that offers 10% off on
// first order in exchange for creating an account.
//
// Behaviour:
//   · Mounts on every page but only triggers on /, /en, /nl, /fr, /ru —
//     never on /sign-up, /sign-in, /admin, /cart, /checkout, /account.
//   · 3-second delay after first paint so the hero gets a moment to
//     breathe before the modal lands.
//   · 14-day suppression cookie on dismissal, on submit-click ("Create
//     my account"), or on close. Stored in localStorage — Sofia's
//     analytics intentionally not involved, no server hit.
//   · Hidden entirely if the user is already signed in (passed in by
//     the layout) — no point pestering an existing customer.
//   · English-only copy by design. The popup is meant to convert
//     quickly; we don't want a locale flicker in the first 3 seconds.
//
// Visual: matches the welcome-popup-preview.html mockup —
//   red −10% block in italic Cormorant, ink heading, ivory card,
//   single primary button to /sign-up, "Already a member" sign-in link,
//   subtle "No thanks" dismissal, hand-drawn vermilion peony branch in
//   the corner, two drifting petals.
//
// CTA target is /en/sign-up so we avoid the locale-detection round-trip
// when the popup is fired before the user has selected a language.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const STORAGE_KEY = "yur:welcome-popup-dismissed";
const SUPPRESS_DAYS = 14;
const DELAY_MS = 3_000;

/** Routes where the popup should NEVER fire — auth flows, admin, and
 *  any conversion-funnel page where it would be intrusive. */
const SUPPRESSED_PATH_PATTERNS = [
  /^\/(?:en|nl|fr|ru)?\/?(?:sign-up|sign-in|account)(?:\/|$)/i,
  /^\/(?:en|nl|fr|ru)?\/?(?:cart|checkout)(?:\/|$)/i,
  /^\/admin(?:\/|$)/i,
  /^\/auth(?:\/|$)/i,
  /^\/newsletter(?:\/|$)/i,
];

export function RegisterWelcomePopup({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Bail conditions — order matters, cheapest checks first.
    if (isSignedIn) return;
    if (SUPPRESSED_PATH_PATTERNS.some((re) => re.test(pathname))) return;

    // Honor 14-day dismissal window.
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
      // localStorage unavailable (private mode in older Safaris) —
      // proceed to show the popup. Worst case: shown every visit.
    }

    const timer = window.setTimeout(() => setOpen(true), DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isSignedIn, pathname]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* see above */
    }
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{
        background: "rgba(20,17,15,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "yur-popup-fade 600ms ease both",
      }}
      onClick={(e) => {
        // Click on the dim backdrop closes — but not when the click
        // bubbled out of the modal itself.
        if (e.target === e.currentTarget) dismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="yur-welcome-popup-title"
    >
      <div
        className="relative w-[min(480px,92vw)] border border-ink/10 bg-rice px-11 pb-9 pt-12"
        style={{
          boxShadow:
            "0 20px 60px -20px rgba(20,17,15,0.25), 0 8px 24px -8px rgba(20,17,15,0.18)",
          animation: "yur-popup-rise 700ms cubic-bezier(0.2,0.8,0.2,1) 200ms both",
        }}
      >
        {/* close X */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute left-4 top-4 flex h-7 w-7 items-center justify-center text-ink-mid transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M2 2 L12 12 M12 2 L2 12" />
          </svg>
        </button>

        {/* hand-drawn peony branch in the corner */}
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

        {/* eyebrow */}
        <div className="mb-4 flex items-center gap-2.5 text-[11px] uppercase tracking-label text-vermilion">
          <span className="h-px w-6 bg-current" />
          <span>Welcome gift</span>
        </div>

        {/* big −10% in vermilion */}
        <p
          className="m-0 font-display italic text-vermilion"
          style={{
            fontWeight: 400,
            fontSize: "88px",
            lineHeight: 0.85,
            letterSpacing: "-0.02em",
          }}
        >
          −10%
        </p>
        <p className="mb-5 mt-1.5 text-[11px] uppercase tracking-label text-ink-mid">
          on your first order
        </p>

        <h2
          id="yur-welcome-popup-title"
          className="m-0 mb-3.5 font-display text-[32px] font-light leading-[1.1] tracking-tight text-ink"
        >
          Create your <em className="not-italic font-display italic text-vermilion" style={{ fontWeight: 400 }}>YU.R</em> account.
        </h2>

        <p className="mb-7 text-[14px] leading-relaxed text-ink-mid">
          Register in under a minute and we&rsquo;ll send a 10% off code straight
          to your inbox &mdash; plus order tracking, saved addresses, and your
          skin-quiz results next time you visit.
        </p>

        <Link
          href="/en/sign-up"
          onClick={dismiss}
          className="group inline-flex w-full items-center justify-center gap-3 border border-ink bg-ink px-6 py-4 text-[12px] uppercase tracking-label text-rice no-underline transition-colors hover:border-vermilion hover:bg-vermilion"
        >
          <span>Create my account</span>
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

        <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-mid">
          By registering you agree to our{" "}
          <Link href="/en/legal/terms" className="text-ink underline underline-offset-[3px]">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/en/legal/privacy" className="text-ink underline underline-offset-[3px]">
            privacy policy
          </Link>
          . The code is single-use and applies once your email is verified.
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="mt-4 w-full bg-transparent p-2 text-center text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
        >
          No thanks
        </button>
      </div>

      {/* Keyframes scoped via global stylesheet would be cleaner, but
          we keep them inline so the component is self-contained. The
          duplicate-name guard via component scope avoids style leaks. */}
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
