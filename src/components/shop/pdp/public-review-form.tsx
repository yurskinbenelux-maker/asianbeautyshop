"use client";

// ─────────────────────────────────────────────────────────────────────────
// PublicReviewForm — collapsible "Write a review" form on the PDP.
//
// Hidden behind a "Write a review" button by default. Expanding it reveals:
//   · Star rating (1-5) — required
//   · Name — required, displayed publicly as "{Name}"
//   · Email — optional, never displayed (an admin uses it for moderation)
//   · Title — optional
//   · Body — required, min 10 chars
//   · Honeypot field "_company" — visually hidden, traps bots
//
// On submit:
//   · Server action validates + persists with isPublished:false
//   · Success state replaces the form with a "thanks, your review is
//     pending moderation" panel
//
// The verified-purchase badge is NEVER awarded here. That stays
// reserved for the post-delivery review-request flow which has the
// order-ownership proof. Drawing that line keeps the trust signal on
// the PDP meaningful.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useState } from "react";
import { Loader2, Star, Check, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  submitPublicReviewAction,
  type SubmitPublicReviewState,
} from "@/app/[locale]/shop/[slug]/review-actions";

export type PublicReviewFormLabels = {
  /** Button that opens the form. "Write a review" */
  openCta: string;
  /** Heading inside the open form. "Share your experience" */
  heading: string;
  /** Field labels */
  ratingLabel: string;
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailHint: string;
  emailPlaceholder: string;
  titleLabel: string;
  titlePlaceholder: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  /** Buttons */
  submit: string;
  submitting: string;
  cancel: string;
  /** Required-field marker, e.g. "Required" or "*" */
  required: string;
  optional: string;
  /** Success block */
  thanksTitle: string;
  thanksBody: string;
  /** Disclaimer rendered under the form */
  moderationNote: string;
  /** Error messages keyed by errorCode in the action */
  errors: {
    invalid_input: string;
    product_not_found: string;
    duplicate: string;
    internal: string;
    fallback: string;
  };
};

const INITIAL_STATE: SubmitPublicReviewState = { ok: false };

export function PublicReviewForm({
  productId,
  locale,
  labels,
}: {
  productId: string;
  locale: string;
  labels: PublicReviewFormLabels;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [state, formAction, pending] = useActionState(
    submitPublicReviewAction,
    INITIAL_STATE,
  );

  // Success → swap the form for a "thanks" panel that stays visible
  // until the page reloads. Keeping the form mounted preserves the
  // useActionState lifecycle (re-mounting would reset `state`).
  if (state.ok) {
    return (
      <div className="mt-8 border border-celadon/40 bg-celadon/5 p-6">
        <div className="flex items-start gap-3">
          <Check
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-celadon"
            aria-hidden
          />
          <div>
            <div className="font-display text-[18px] text-ink">
              {labels.thanksTitle}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-mid">
              {labels.thanksBody}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2.5 text-[12px] uppercase tracking-label text-rice transition-opacity hover:opacity-90"
        >
          {labels.openCta}
        </button>
      </div>
    );
  }

  const errorMessage = state.errorCode
    ? (labels.errors[state.errorCode] ?? labels.errors.fallback)
    : null;

  const displayRating = hoverRating ?? rating;

  return (
    <form
      action={formAction}
      className="mt-8 border border-ink/10 bg-white/60 p-6"
    >
      {/* Hidden inputs the server action needs */}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="rating" value={rating} />

      {/* Honeypot — visually hidden, screen-reader hidden, autocomplete
          off. A human will never touch this; bots tend to fill every
          input they see. */}
      <input
        type="text"
        name="_company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] top-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="font-display text-[22px] text-ink">{labels.heading}</div>

      {/* Star picker */}
      <fieldset className="mt-5">
        <legend className="text-[11px] uppercase tracking-label text-ink-mid">
          {labels.ratingLabel}
          <span className="ml-1 text-vermilion">*</span>
        </legend>
        <div
          className="mt-2 inline-flex items-center gap-1"
          onMouseLeave={() => setHoverRating(null)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              aria-pressed={rating === n}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <Star
                width={26}
                height={26}
                className={cn(
                  "transition-colors",
                  n <= displayRating
                    ? "fill-vermilion text-vermilion"
                    : "fill-none text-ink/25",
                )}
              />
            </button>
          ))}
        </div>
      </fieldset>

      {/* Two-column on desktop, single on mobile */}
      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label
            htmlFor="prf-name"
            className="text-[11px] uppercase tracking-label text-ink-mid"
          >
            {labels.nameLabel}
            <span className="ml-1 text-vermilion">*</span>
          </label>
          <input
            id="prf-name"
            name="authorName"
            type="text"
            required
            minLength={2}
            maxLength={80}
            placeholder={labels.namePlaceholder}
            className="mt-1.5 w-full border border-ink/15 bg-white px-3 py-2 text-[14px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="prf-email"
            className="text-[11px] uppercase tracking-label text-ink-mid"
          >
            {labels.emailLabel}{" "}
            <span className="lowercase text-ink-mid/70">
              ({labels.optional})
            </span>
          </label>
          <input
            id="prf-email"
            name="authorEmail"
            type="email"
            maxLength={120}
            placeholder={labels.emailPlaceholder}
            className="mt-1.5 w-full border border-ink/15 bg-white px-3 py-2 text-[14px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-ink-mid">{labels.emailHint}</p>
        </div>
      </div>

      <div className="mt-5">
        <label
          htmlFor="prf-title"
          className="text-[11px] uppercase tracking-label text-ink-mid"
        >
          {labels.titleLabel}{" "}
          <span className="lowercase text-ink-mid/70">
            ({labels.optional})
          </span>
        </label>
        <input
          id="prf-title"
          name="title"
          type="text"
          maxLength={120}
          placeholder={labels.titlePlaceholder}
          className="mt-1.5 w-full border border-ink/15 bg-white px-3 py-2 text-[14px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        />
      </div>

      <div className="mt-5">
        <label
          htmlFor="prf-body"
          className="text-[11px] uppercase tracking-label text-ink-mid"
        >
          {labels.bodyLabel}
          <span className="ml-1 text-vermilion">*</span>
        </label>
        <textarea
          id="prf-body"
          name="body"
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          placeholder={labels.bodyPlaceholder}
          className="mt-1.5 w-full resize-y border border-ink/15 bg-white px-3 py-2 text-[14px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-ink-mid">
        {labels.moderationNote}
      </p>

      {errorMessage && (
        <div className="mt-4 flex items-start gap-2 border border-vermilion/30 bg-vermilion/5 px-3 py-2 text-[12px] text-vermilion">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2.5 text-[12px] uppercase tracking-label text-rice transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {labels.submitting}
            </>
          ) : (
            labels.submit
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="inline-flex items-center gap-2 border border-ink/15 bg-white px-5 py-2.5 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
