// ─────────────────────────────────────────────────────────────────────────
// /admin/loyalty/tasks/claims — review queue for MANUAL_REVIEW submissions.
//
// One card per claim with: customer email, task title, submitted proof
// URL (clickable), customer note, plus Approve / Reject buttons. Tabs
// to switch between Pending / Approved / Rejected.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ChevronLeft, ListChecks, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { LoyaltyTaskClaimStatus } from "@prisma/client";
import { requireCapability } from "@/lib/auth-roles";
import { ClaimDecisionForms } from "./forms";

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReadonlyArray<LoyaltyTaskClaimStatus> = [
  LoyaltyTaskClaimStatus.PENDING,
  LoyaltyTaskClaimStatus.APPROVED,
  LoyaltyTaskClaimStatus.REJECTED,
];

export default async function ClaimsQueuePage({ searchParams }: Props) {
  await requireCapability("loyalty.edit");
  const { status } = await searchParams;

  const activeStatus: LoyaltyTaskClaimStatus =
    status && VALID_STATUSES.includes(status.toUpperCase() as LoyaltyTaskClaimStatus)
      ? (status.toUpperCase() as LoyaltyTaskClaimStatus)
      : LoyaltyTaskClaimStatus.PENDING;

  const [pendingCount, approvedCount, rejectedCount, claims] = await Promise.all([
    prisma.loyaltyTaskClaim.count({ where: { status: LoyaltyTaskClaimStatus.PENDING } }),
    prisma.loyaltyTaskClaim.count({ where: { status: LoyaltyTaskClaimStatus.APPROVED } }),
    prisma.loyaltyTaskClaim.count({ where: { status: LoyaltyTaskClaimStatus.REJECTED } }),
    prisma.loyaltyTaskClaim.findMany({
      where: { status: activeStatus },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        task: { select: { title: true, points: true, slug: true } },
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <Link
        href="/admin/loyalty/tasks"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        All tasks
      </Link>
      <h1 className="mt-3 font-display text-[28px] leading-tight text-ink">
        Review queue
      </h1>
      <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">
        Approve to award points immediately and email the customer.
        Rejecting also emails — paste a one-line reason so they know what
        to fix for next time.
      </p>

      <nav className="mt-8 flex gap-6 border-b border-ink/10 text-[12px] uppercase tracking-label">
        <TabLink
          href="/admin/loyalty/tasks/claims?status=pending"
          active={activeStatus === LoyaltyTaskClaimStatus.PENDING}
        >
          Pending {pendingCount > 0 ? `(${pendingCount})` : ""}
        </TabLink>
        <TabLink
          href="/admin/loyalty/tasks/claims?status=approved"
          active={activeStatus === LoyaltyTaskClaimStatus.APPROVED}
        >
          Approved {approvedCount > 0 ? `(${approvedCount})` : ""}
        </TabLink>
        <TabLink
          href="/admin/loyalty/tasks/claims?status=rejected"
          active={activeStatus === LoyaltyTaskClaimStatus.REJECTED}
        >
          Rejected {rejectedCount > 0 ? `(${rejectedCount})` : ""}
        </TabLink>
      </nav>

      <div className="mt-8 space-y-4">
        {claims.length === 0 ? (
          <div className="border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
            <ListChecks className="mx-auto h-5 w-5 text-ink-mid" />
            <p className="mt-3 text-[13px] text-ink-mid">
              {activeStatus === LoyaltyTaskClaimStatus.PENDING
                ? "Queue's empty. Nice."
                : "No claims here yet."}
            </p>
          </div>
        ) : (
          claims.map((c) => {
            const customerName =
              [c.user?.firstName, c.user?.lastName].filter(Boolean).join(" ") ||
              c.user?.email ||
              "—";
            return (
              <article
                key={c.id}
                className="border border-ink/10 bg-white/60 px-6 py-5"
              >
                <header className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-label text-ink-mid">
                      {c.task?.slug ?? "—"}
                    </p>
                    <h3 className="mt-0.5 font-display text-[20px] leading-tight text-ink">
                      {c.task?.title ?? "(deleted task)"}
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-[16px] text-vermilion">
                      +{(c.task?.points ?? 0).toLocaleString()} pts
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                      {c.createdAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </header>

                <dl className="mt-4 grid grid-cols-1 gap-3 text-[13px] md:grid-cols-2">
                  <div>
                    <dt className="text-[10px] uppercase tracking-label text-ink-mid">
                      Customer
                    </dt>
                    <dd className="mt-0.5 text-ink">{customerName}</dd>
                    <dd className="text-ink-mid">{c.user?.email}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-label text-ink-mid">
                      Proof
                    </dt>
                    <dd className="mt-0.5">
                      {c.proofUrl ? (
                        <a
                          href={c.proofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-ink underline underline-offset-[3px] hover:text-vermilion"
                        >
                          {c.proofUrl}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-ink-mid">No URL submitted</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {c.notes ? (
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-label text-ink-mid">
                      Customer note
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-ink">
                      {c.notes}
                    </p>
                  </div>
                ) : null}

                {c.adminNote ? (
                  <div className="mt-3 border-l-2 border-ink/20 bg-ink/5 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-label text-ink-mid">
                      Admin note
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-ink">
                      {c.adminNote}
                    </p>
                  </div>
                ) : null}

                {activeStatus === LoyaltyTaskClaimStatus.PENDING ? (
                  <ClaimDecisionForms claimId={c.id} />
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "-mb-px border-b-2 pb-3 transition-colors " +
        (active
          ? "border-vermilion text-ink"
          : "border-transparent text-ink-mid hover:text-ink")
      }
    >
      {children}
    </Link>
  );
}
