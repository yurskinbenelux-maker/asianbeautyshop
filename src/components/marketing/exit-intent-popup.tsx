// ─────────────────────────────────────────────────────────────────────────
// ExitIntentPopup — first-visit-only popup that captures the visitor's
// email when they look like they're about to leave. Funnels into the
// existing newsletter double-opt-in pipeline (which then mints the 10%
// welcome coupon — see /lib/newsletter/welcome-coupon.ts).
//
// Triggers:
//   • Desktop: mouseleave at the top edge of the viewport
//   • Mobile : 30s of being on the page without an interaction (keeps
//              us from blocking quick scrollers, gives genuine browsers
//              a chance to read first)
//
// Hard suppression rules:
//   • Routes /cart, /checkout, /account/*, /admin/*, /sign-in, /sign-up
//     never show the popup. Customers in flight don't need an interrupt.
//   • Once dismissed or subscribed, a localStorage flag mutes the
//     popup for 30 days (subscribed) or 30 days (dismissed) — same cap
//     so we don't pester the same browser repeatedly.
//   • Wait at least 8 seconds after mount before arming, even on
//     desktop. Mouse-leaving 200ms after landing is a bounce, not an
//     intent — interrupting them with a popup is bad manners.
//
// We render the popup only after it's about to be shown (no hidden
// dialog hovering in the DOM on every page) so the SSR HTML stays clean
// and CLS-friendly.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  subscribeToNewsletterAction,
  type NewsletterState,
} from "@/lib/newsletter/actions";

const STORAGE_KEY = "yur_exit_intent_state";
const SUPPRESS_DAYS = 30;
const ARM_DELAY_MS = 8_000;
const MOBILE_INACTIVITY_MS = 30_000;

const SUPPRESSED_PATH_PREFIXES = [
  "/cart",
  "/checkout",
  "/account",
  "/admin",
  "/sign-in",
  "/sign-up",
  "/newsletter", // confirm/confirmed/invalid pages — don't double-prompt
];

type SuppressState = {
  /** ISO date string. We re-arm after this. */
  until: string;
};

function readSuppressUntil(): Date | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SuppressState;
    return new Date(parsed.until);
  } catch {
    return null;
  }
}

function writeSuppressUntil(): void {
  if (typeof window === "undefined") return;
  const until = new Date();
  until.setDate(until.getDate() + SUPPRESS_DAYS);
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ until: until.toISOString() } satisfies SuppressState),
    );
  } catch {
    // Quota / privacy mode — ignore. Worst case we re-prompt in this
    // session; no big deal.
  }
}

function isSuppressedRoute(pathname: string): boolean {
  // Strip the locale prefix ("/en/cart" → "/cart") before matching.
  const stripped = pathname.replace(/^\/(en|nl|fr|ru)(?=\/|$)/, "") || "/";
  return SUPPRESSED_PATH_PREFIXES.some((p) => stripped.startsWith(p));
}

const INITIAL: NewsletterState = { ok: false, message: "" };

export function ExitIntentPopup() {
  const t = useTranslations("exit_intent");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const armed = useRef(false);
  const [state, action] = useActionState(
    subscribeToNewsletterAction,
    INITIAL,
  );

  // Decide whether to arm based on route + storage. We only register
  // listeners if all gates pass — that keeps inert pages truly inert.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isSuppressedRoute(pathname)) return;

    const until = readSuppressUntil();
    if (until && until.getTime() > Date.now()) return;

    let cancelled = false;
    let inactivityTimer: number | null = null;
    let armTimer: number | null = null;

    const trigger = () => {
      if (cancelled || armed.current) return;
      armed.current = true;
      setOpen(true);
    };

    const onMouseLeave = (e: MouseEvent) => {
      // Only fire when the cursor leaves the TOP of the viewport.
      // Side / bottom exits are usually scroll or task-switch, not
      // intent to abandon.
      if (e.clientY <= 0) trigger();
    };

    const resetInactivity = () => {
      if (inactivityTimer !== null) window.clearTimeout(inactivityTimer);
      inactivityTimer = window.setTimeout(trigger, MOBILE_INACTIVITY_MS);
    };

    armTimer = window.setTimeout(() => {
      if (cancelled) return;
      // Desktop trigger
      document.documentElement.addEventListener("mouseleave", onMouseLeave);
      // Mobile / touch trigger — start the inactivity timer; reset on
      // any user interaction so genuine readers aren't interrupted.
      resetInactivity();
      window.addEventListener("scroll", resetInactivity, { passive: true });
      window.addEventListener("touchstart", resetInactivity, { passive: true });
      window.addEventListener("keydown", resetInactivity);
    }, ARM_DELAY_MS);

    return () => {
      cancelled = true;
      if (armTimer !== null) window.clearTimeout(armTimer);
      if (inactivityTimer !== null) window.clearTimeout(inactivityTimer);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("scroll", resetInactivity);
      window.removeEventListener("touchstart", resetInactivity);
      window.removeEventListener("keydown", resetInactivity);
    };
  }, [pathname]);

  // Esc-to-close, body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAndSuppress();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Once the action returns ok, mute future prompts — they've already
  // joined. Failure leaves the popup open with the inline error so the
  // user can retry with a corrected email.
  useEffect(() => {
    if (state.ok) {
      writeSuppressUntil();
      // Stay open briefly to show the success message, then close.
      const t = window.setTimeout(() => setOpen(false), 2_000);
      return () => window.clearTimeout(t);
    }
  }, [state.ok]);

  function closeAndSuppress() {
    writeSuppressUntil();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-intent-title"
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label={t("close")}
        onClick={closeAndSuppress}
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md border border-ink/10 bg-rice p-8 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35)] md:p-10">
        <button
          type="button"
          onClick={closeAndSuppress}
          aria-label={t("close")}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center text-ink-mid transition-colors hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="eyebrow">{t("eyebrow")}</div>
        <h2
          id="exit-intent-title"
          className="mt-3 font-display text-[28px] leading-tight text-ink md:text-[32px]"
        >
          {t("title")}
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-mid">
          {t("body")}
        </p>

        {state.ok ? (
          <p className="mt-6 border border-ink/10 bg-white/70 px-4 py-3 text-[13px] text-ink">
            {state.message || t("success")}
          </p>
        ) : (
          <form action={action} className="mt-6 space-y-3">
            {/* Tag the source so admin analytics can split popup conversions
                from inline-footer subscriptions. */}
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="source" value="exit_intent" />
            <label className="block">
              <span className="sr-only">{t("email_label")}</span>
              <input
                type="email"
                name="email"
                required
                autoFocus
                placeholder={t("email_placeholder")}
                className="w-full border border-ink/15 bg-white px-3 py-3 text-[14px] text-ink focus:border-ink focus:outline-none"
              />
            </label>
            <SubmitButton label={t("cta")} loadingLabel={t("cta_loading")} />
            {state.message && !state.ok && (
              <p
                role="alert"
                className="text-[12px] uppercase tracking-label text-vermilion"
              >
                {state.message}
              </p>
            )}
          </form>
        )}

        <p className="mt-4 text-[10px] uppercase tracking-label text-ink-mid">
          {t("fine_print")}
        </p>

        <button
          type="button"
          onClick={closeAndSuppress}
          className="mt-2 text-[11px] uppercase tracking-label text-ink-mid underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}

function SubmitButton({
  label,
  loadingLabel,
}: {
  label: string;
  loadingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 bg-ink text-[12px] uppercase tracking-label text-rice transition-colors",
        pending ? "opacity-70" : "hover:bg-vermilion",
      )}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {pending ? loadingLabel : label}
    </button>
  );
}
