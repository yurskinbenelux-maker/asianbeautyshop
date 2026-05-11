// ─────────────────────────────────────────────────────────────────────────
// ReviewCard — one row in the moderation queue.
// Pure server component; forms post directly to the server actions.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Star, CheckCircle2, Ban, Trash2, Package } from "lucide-react";
import {
  approveReviewAction,
  unpublishReviewAction,
  deleteReviewAction,
} from "@/app/admin/reviews/actions";
import type { ReviewRow } from "@/lib/queries/admin-reviews";
import { ADMIN_DATE_FMT } from "@/lib/utils/format-date";

const DATE = ADMIN_DATE_FMT;

export function ReviewCard({ review }: { review: ReviewRow }) {
  return (
    <article className="border border-ink/10 bg-white/60 p-6">
      {/* header: rating + product + status */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <StarRow rating={review.rating} />
          {review.title && (
            <h3 className="font-display text-[16px] text-ink">
              {review.title}
            </h3>
          )}
        </div>

        <div className="flex items-center gap-2">
          {review.isVerified && (
            <span className="inline-flex items-center gap-1 border border-sage/30 bg-sage/5 px-2 py-0.5 text-[10px] uppercase tracking-label text-sage">
              Verified
            </span>
          )}
          <span
            className={
              review.isPublished
                ? "inline-flex items-center gap-1 border border-ink bg-ink px-2 py-0.5 text-[10px] uppercase tracking-label text-white"
                : "inline-flex items-center gap-1 border border-ink/20 bg-white px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid"
            }
          >
            {review.isPublished ? "Published" : "Pending"}
          </span>
        </div>
      </header>

      {/* body */}
      <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-ink">
        {review.body}
      </p>

      {/* meta: customer + product + date */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-ink-mid">
        <span>
          {review.customerName}
          {review.customerEmail ? ` · ${review.customerEmail}` : ""}
        </span>
        <Link
          href={`/admin/products/${review.productId}`}
          className="inline-flex items-center gap-1 underline-offset-4 hover:text-ink hover:underline"
        >
          <Package className="h-3 w-3" />
          {review.productName}
        </Link>
        <span className="uppercase tracking-label">{review.locale}</span>
        <span>{DATE.format(review.createdAt)}</span>
      </div>

      {/* actions */}
      <footer className="mt-5 flex flex-wrap gap-2 border-t border-ink/10 pt-4">
        {review.isPublished ? (
          <form action={unpublishReviewAction}>
            <input type="hidden" name="id" value={review.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 border border-ink/20 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
            >
              <Ban className="h-3 w-3" />
              Unpublish
            </button>
          </form>
        ) : (
          <form action={approveReviewAction}>
            <input type="hidden" name="id" value={review.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-ink/90"
            >
              <CheckCircle2 className="h-3 w-3" />
              Approve
            </button>
          </form>
        )}

        <form action={deleteReviewAction}>
          <input type="hidden" name="id" value={review.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 border border-vermilion/30 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-vermilion hover:bg-vermilion/5"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </form>
      </footer>
    </article>
  );
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={
            i < rating ? "h-3.5 w-3.5 fill-gold text-gold" : "h-3.5 w-3.5 text-ink/20"
          }
        />
      ))}
    </div>
  );
}
