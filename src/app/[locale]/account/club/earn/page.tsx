// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/club/earn — list of earning tasks for this customer.
//
// AUTO tasks render as "automatic" rows (no link, no submission). Manual
// tasks link to the per-slug detail page where the customer submits proof.
// "Pending" / "Approved" status badges so customers know where they stand.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { ChevronLeft, Sparkles, Clock, Check } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { listTasksForUser } from "@/lib/loyalty/tasks";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ submitted?: string }>;
};

export const dynamic = "force-dynamic";

export default async function EarnPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { submitted } = await searchParams;
  setRequestLocale(locale);

  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/club/earn",
  });

  const tasks = await listTasksForUser({ userId: profile.id });

  return (
    <section>
      <Link
        href="/account"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to account
      </Link>
      <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
        Ways to earn
      </h1>
      <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
        Some points come automatically from orders + your birthday. Others
        you can claim by sharing us with your friends or following on social.
      </p>

      {submitted ? (
        <div className="mt-6 border border-vermilion/30 bg-vermilion/5 px-5 py-4">
          <p className="text-[10px] uppercase tracking-label text-vermilion">
            Submitted
          </p>
          <p className="mt-1 text-[13px] text-ink">
            Sofia will review within 48 hours. You'll get an email either way.
          </p>
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <div className="mt-12 border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-ink-mid" />
          <p className="mt-4 font-display text-[20px] text-ink">
            Tasks coming soon
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
            Sofia is curating fresh ways to earn points. Check back shortly.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-ink/10 border border-ink/10 bg-white/60">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskRow({
  task,
}: {
  task: Awaited<ReturnType<typeof listTasksForUser>>[number];
}) {
  const showLink = task.status === "available" || task.status === "pending";
  const Body = (
    <>
      <div className="min-w-0">
        <p className="text-[14px] text-ink">{task.title}</p>
        {task.description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
            {task.description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {task.points > 0 ? (
          <span className="font-display text-[14px] text-vermilion">
            +{task.points.toLocaleString()} pts
          </span>
        ) : null}
        <StatusBadge status={task.status} />
      </div>
    </>
  );

  if (showLink) {
    return (
      <li>
        <Link
          href={`/account/club/earn/${task.slug}`}
          className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-rice-dim/40"
        >
          {Body}
        </Link>
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      {Body}
    </li>
  );
}

function StatusBadge({
  status,
}: {
  status: "auto" | "available" | "pending" | "approved";
}) {
  if (status === "auto") {
    return (
      <span className="text-[10px] uppercase tracking-label text-ink-mid">
        Automatic
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 bg-ink/5 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
        <Clock className="h-3 w-3" /> Pending
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 bg-sage/10 px-2 py-0.5 text-[10px] uppercase tracking-label text-sage">
        <Check className="h-3 w-3" /> Done
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-label text-vermilion">
      Claim →
    </span>
  );
}
