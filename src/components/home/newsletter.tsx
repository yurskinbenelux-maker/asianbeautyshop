// ─────────────────────────────────────────────────────────────────────────
// Newsletter — double opt-in signup wired to subscribeToNewsletterAction.
//
// Flow:
//   1. User submits email → server action generates a token, stores the
//      hash on NewsletterSubscriber, sends a Resend confirmation email.
//   2. User clicks the link → /api/newsletter/confirm flips confirmedAt
//      and redirects to /{locale}/newsletter/confirmed.
//
// The form uses React 19's useActionState so errors and success messages
// come back typed. Framer Motion keeps the copy reveal on the original
// editorial animation; the form itself animates the success state.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import {
  subscribeToNewsletterAction,
  type NewsletterState,
} from "@/lib/newsletter/actions";

// All four strings are admin-editable via the `home.newsletter` SiteCopy
// section. Placeholder is reused as the input's aria-label so we don't
// need a separate override for screen readers.
export type NewsletterCopy = {
  title: string;
  lede: string;
  cta: string;
  placeholder: string;
};

const INITIAL_STATE: NewsletterState | null = null;

export function Newsletter({
  locale,
  copy,
}: {
  locale: string;
  copy: NewsletterCopy;
}) {
  const [state, dispatch, pending] = useActionState(
    subscribeToNewsletterAction,
    INITIAL_STATE,
  );

  return (
    <section className="container py-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.8 }}
        className="mx-auto max-w-[52ch] text-center"
      >
        {copy.title ? <div className="eyebrow">{copy.title}</div> : null}
        {copy.lede ? (
          <h2 className="mt-4 font-display text-[36px] leading-tight text-ink md:text-[48px]">
            {copy.lede}
          </h2>
        ) : null}

        {state?.ok ? (
          // Gentle success state — no CTA, no "share on twitter", just
          // an editorial confirmation that matches the brand voice.
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-10 text-[14px] leading-relaxed text-ink-mid"
          >
            {state.message}
          </motion.p>
        ) : (
          <>
            <form
              action={dispatch}
              className="mx-auto mt-10 flex max-w-md items-center gap-0 border-b border-ink"
            >
              {/* The action needs locale to localise the confirmation
                  email and source to help an admin attribute signups. */}
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="source" value="homepage" />

              <input
                type="email"
                name="email"
                required
                placeholder={copy.placeholder}
                aria-label={copy.placeholder}
                disabled={pending}
                className="flex-1 bg-transparent py-3 text-[15px] text-ink placeholder:text-ink-mid/60 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={pending}
                className="group flex items-center gap-2 py-3 text-[12px] uppercase tracking-label text-ink transition-colors hover:text-vermilion disabled:opacity-60"
              >
                {copy.cta}
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                )}
              </button>
            </form>

            {/* Error banner — only shows on a real failure. Styled quietly
                so it doesn't overpower the editorial section. */}
            {state && !state.ok && (
              <p
                role="alert"
                className="mt-4 text-[12px] leading-relaxed text-vermilion"
              >
                {state.message}
              </p>
            )}
          </>
        )}

        <p className="mt-4 text-[11px] tracking-caps text-ink-mid">
          Double opt-in · GDPR · unsubscribe any time
        </p>
      </motion.div>
    </section>
  );
}
