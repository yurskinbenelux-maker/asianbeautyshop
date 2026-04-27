// ─────────────────────────────────────────────────────────────────────────
// OrderReviewForm — collapsed-by-default review submission for one line
// item on the order detail page. Closes the loop on the post-purchase
// review-request email (src/lib/email/review-request.ts).
//
// Why collapsed-by-default:
//   The order page lists every item the customer bought. If we rendered an
//   open form per item the page would feel like a wall of textareas. Hiding
//   each one behind a quiet "Leave a review" link keeps the page tidy and
//   matches the editorial tone — the customer opts in per product.
//
// Three rendered states:
//   1. trigger     — small link "Leave a review"
//   2. open form   — rating stars + optional title + body + submit
//   3. submitted   — quiet thank-you chip ("Thanks — Sofia will publish it
//                    after a quick read.")
//
// The "already reviewed" branch isn't surfaced inline because the parent
// page filters it out before mounting this component (see page.tsx).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import {
  submitProductReviewAction,
  type SubmitReviewState,
} from "@/app/[locale]/account/orders/[number]/review-actions";

type Props = {
  /** Order's public number (e.g. "YUR-1042"). */
  orderNumber: string;
  /** UUID of the product being reviewed. */
  productId: string;
  /** Display name for the product (used in the form heading). */
  productName: string;
  /** URL locale ("en"|"nl"|"fr"|"ru") — passed to the server action. */
  urlLocale: string;
};

const initialState: SubmitReviewState = { ok: false };

export function OrderReviewForm({
  orderNumber,
  productId,
  productName,
  urlLocale,
}: Props) {
  const t = useTranslations("account.review_form");
  const [open, setOpen] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [rating, setRating] = useState<number>(0);

  const [state, formAction, isPending] = useActionState(
    submitProductReviewAction,
    initialState,
  );

  // Once submitted successfully, replace the whole module with a quiet
  // confirmation chip — the form should feel "spent", not reusable.
  if (state.ok) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 border border-ink/15 bg-rice/40 px-3 py-2 text-[12px] uppercase tracking-label text-ink-mid">
        <Star className="h-3.5 w-3.5 fill-vermilion text-vermilion" aria-hidden />
        {t("submitted")}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-[12px] uppercase tracking-label text-ink-mid underline-offset-4 transition-colors hover:text-vermilion hover:underline"
      >
        {t("trigger")}
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-4 border border-ink/10 bg-white/60 p-4 md:p-5">
      {/* hidden context */}
      <input type="hidden" name="locale" value={urlLocale} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="rating" value={rating} />

      <p className="text-[12px] uppercase tracking-label text-ink-mid">
        {t("heading", { name: productName })}
      </p>

      {/* ── rating ────────────────────────────────────────────── */}
      <fieldset className="mt-3">
        <legend className="sr-only">{t("rating_label")}</legend>
        <div
          className="flex items-center gap-1"
          onMouseLeave={() => setHoverRating(null)}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = (hoverRating ?? rating) >= n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHoverRating(n)}
                aria-label={t("rating_aria", { n })}
                aria-pressed={rating === n}
                className="rounded-sm p-1 transition-colors hover:scale-110"
              >
                <Star
                  className={cn(
                    "h-5 w-5 transition-colors",
                    filled
                      ? "fill-vermilion text-vermilion"
                      : "fill-transparent text-ink/30",
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ── title (optional) ──────────────────────────────────── */}
      <label className="mt-4 block">
        <span className="text-[11px] uppercase tracking-label text-ink-mid">
          {t("title_label")}
        </span>
        <input
          type="text"
          name="title"
          maxLength={80}
          className="mt-1.5 w-full border border-ink/15 bg-white px-3 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
          placeholder={t("title_placeholder")}
        />
      </label>

      {/* ── body ──────────────────────────────────────────────── */}
      <label className="mt-3 block">
        <span className="text-[11px] uppercase tracking-label text-ink-mid">
          {t("body_label")}
        </span>
        <textarea
          name="body"
          rows={4}
          required
          minLength={5}
          maxLength={1500}
          className="mt-1.5 w-full resize-y border border-ink/15 bg-white px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-ink focus:outline-none"
          placeholder={t("body_placeholder")}
        />
      </label>

      {/* ── error surface ─────────────────────────────────────── */}
      {state.errorCode && (
        <p
          role="alert"
          className="mt-3 text-[12px] uppercase tracking-label text-vermilion"
        >
          {t(`error.${state.errorCode}`)}
        </p>
      )}

      {/* ── actions ───────────────────────────────────────────── */}
      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || rating === 0}
          className={cn(
            "inline-flex h-10 items-center justify-center px-5 text-[12px] uppercase tracking-label transition-colors",
            isPending || rating === 0
              ? "bg-ink/40 text-rice cursor-not-allowed"
              : "bg-ink text-rice hover:bg-vermilion",
          )}
        >
          {isPending ? t("submitting") : t("submit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
