// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/club/earn/[slug] — task detail + submission form.
//
// Server component fetches the task + the customer's most-recent claim
// status, then either renders the form (available) or a status panel
// (pending / approved / auto).
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/routing";
import { ChevronLeft, Clock, Check } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { getTaskWithUserStatus } from "@/lib/loyalty/tasks";
import { SubmitTaskForm } from "./submit-form";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/club/earn/${slug}`,
  });

  const result = await getTaskWithUserStatus({ slug, userId: profile.id });
  if (!result) redirect(`/${locale}/account/club/earn`);

  const { task, status, latestClaim } = result;

  return (
    <section className="mx-auto max-w-xl">
      <Link
        href="/account/club/earn"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        All tasks
      </Link>

      <div className="mt-6 border border-ink/10 bg-white px-8 py-10">
        {task.points > 0 ? (
          <p className="text-[10px] uppercase tracking-label text-vermilion">
            +{task.points.toLocaleString()} pts
          </p>
        ) : null}
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          {task.title}
        </h1>
        {task.description ? (
          <p className="mt-3 text-[14px] leading-relaxed text-ink-mid">
            {task.description}
          </p>
        ) : null}

        {/* Long-form instructions (admin-supplied HTML) */}
        {task.instructionsHtml ? (
          <div
            className="prose prose-sm mt-6 max-w-none text-[14px] leading-relaxed text-ink"
            // Admin-controlled content. Sanitisation is an admin's
            // responsibility — admin role is OWNER-only.
            dangerouslySetInnerHTML={{ __html: task.instructionsHtml }}
          />
        ) : null}

        {/* Status panels */}
        {status === "auto" ? (
          <div className="mt-8 border border-ink/10 bg-rice-dim/40 px-5 py-4 text-center text-[13px] text-ink-mid">
            This task is awarded automatically — no submission needed.
          </div>
        ) : status === "pending" ? (
          <div className="mt-8 flex items-start gap-3 border border-ink/10 bg-rice-dim/40 px-5 py-4 text-[13px] text-ink-mid">
            <Clock className="h-4 w-4 shrink-0 text-ink-mid" aria-hidden />
            <div>
              <p className="text-ink">We've received your submission.</p>
              <p className="mt-1">
                an admin will review within 48 hours. You'll get an email either way.
                {latestClaim?.proofUrl ? (
                  <>
                    {" "}
                    Submitted link:{" "}
                    <a
                      href={latestClaim.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink underline underline-offset-[3px]"
                    >
                      {latestClaim.proofUrl}
                    </a>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        ) : status === "approved" ? (
          <div className="mt-8 flex items-center gap-3 border border-sage/30 bg-sage/5 px-5 py-4 text-[13px] text-ink">
            <Check className="h-4 w-4 shrink-0 text-sage" aria-hidden />
            You've already claimed this one. Browse other ways to earn.
          </div>
        ) : (
          <div className="mt-8">
            <SubmitTaskForm
              locale={locale}
              slug={task.slug}
              requiresProofUrl={task.requiresProofUrl}
            />
          </div>
        )}
      </div>
    </section>
  );
}
