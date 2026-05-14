// ─────────────────────────────────────────────────────────────────────────
// /admin/reviews — moderation queue.
//
// Defaults to the Pending tab so the common case (brand-new reviews
// awaiting approval) is front-and-centre. Filter chips switch scope.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listAdminReviews,
  type ReviewScope,
} from "@/lib/queries/admin-reviews";
import { ReviewCard } from "@/components/admin/reviews/review-card";

export const dynamic = "force-dynamic";

const SCOPES: { id: ReviewScope; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "published", label: "Published" },
  { id: "all", label: "All" },
];

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: scopeRaw } = await searchParams;
  const scope: ReviewScope =
    scopeRaw === "published" || scopeRaw === "all" ? scopeRaw : "pending";

  const { rows, total, counts } = await listAdminReviews(scope);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8">
        <div className="eyebrow">Reviews</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Moderation queue
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">
          Approve reviews to show them on the product page. Delete spam or
          unintelligible ones. Customers never see anything until you approve.
        </p>
      </header>

      {/* filter chips */}
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Filter reviews">
        {SCOPES.map((s) => {
          const on = scope === s.id;
          const count = counts[s.id];
          return (
            <Link
              key={s.id}
              href={s.id === "pending" ? "/admin/reviews" : `/admin/reviews?scope=${s.id}`}
              className={cn(
                "inline-flex items-center gap-2 border px-3 py-1.5 text-[11px] uppercase tracking-label transition-colors",
                on
                  ? "border-ink bg-ink text-white"
                  : "border-ink/20 bg-white text-ink-mid hover:text-ink",
              )}
            >
              {s.label}
              <span
                className={
                  on
                    ? "rounded-full bg-white/20 px-1.5 text-[10px]"
                    : "rounded-full bg-ink/10 px-1.5 text-[10px] text-ink-mid"
                }
              >
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState scope={scope} />
      ) : (
        <div className="space-y-5">
          {rows.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}

      {total > rows.length && (
        <p className="mt-8 text-center text-[11px] text-ink-mid">
          Showing {rows.length} of {total}. Pagination is coming in a later
          batch — for now, moderate what's on screen and the next page will
          slot in.
        </p>
      )}
    </div>
  );
}

function EmptyState({ scope }: { scope: ReviewScope }) {
  const message =
    scope === "pending"
      ? "Nothing to moderate — you're all caught up."
      : scope === "published"
      ? "No reviews are currently live on the store."
      : "No reviews have been submitted yet.";

  return (
    <div className="border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
      <MessageSquare className="mx-auto h-6 w-6 text-ink-mid" />
      <h2 className="mt-4 font-display text-[22px] text-ink">Inbox zero</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">{message}</p>
    </div>
  );
}
