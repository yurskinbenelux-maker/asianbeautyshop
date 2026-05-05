// ─────────────────────────────────────────────────────────────────────────
// /admin/loyalty/tasks — list + inline create form.
//
// Pending-claim count badges live here too (one per MANUAL_REVIEW task)
// so Sofia knows where the queue is building up. Phase E adds the actual
// review queue page.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ChevronLeft, Plus, ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { LoyaltyTaskClaimStatus } from "@prisma/client";
import { requireCapability } from "@/lib/auth-roles";
import { TaskForm } from "./form";
import { toggleTaskActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminLoyaltyTasksPage() {
  await requireCapability("loyalty.edit");

  const tasks = await prisma.loyaltyTask.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: {
          claims: { where: { status: LoyaltyTaskClaimStatus.PENDING } },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <Link
        href="/admin/loyalty"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Loyalty hub
      </Link>
      <h1 className="mt-3 font-display text-[28px] leading-tight text-ink">
        Ways to earn
      </h1>
      <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">
        Customer-side earning options beyond automatic accrual. Manual-review
        tasks let customers submit proof (e.g. an Instagram repost link) for
        you to approve.
      </p>

      <section className="mt-8">
        <h2 className="eyebrow mb-3">Existing tasks</h2>
        {tasks.length === 0 ? (
          <div className="border border-dashed border-ink/15 bg-white/40 px-6 py-10 text-center">
            <ListChecks className="mx-auto h-5 w-5 text-ink-mid" />
            <p className="mt-3 text-[13px] text-ink-mid">No tasks yet.</p>
          </div>
        ) : (
          <div className="border border-ink/10 bg-white/60">
            <table className="w-full text-[13px]">
              <thead className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Points</th>
                  <th className="px-4 py-3">Pending</th>
                  <th className="px-4 py-3 text-right">Active</th>
                  <th className="px-4 py-3 text-right">Edit</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-ink/5 last:border-b-0"
                  >
                    <td className="px-4 py-3 align-middle text-ink">{t.title}</td>
                    <td className="px-4 py-3 align-middle font-mono text-[12px] text-ink-mid">
                      {t.slug}
                    </td>
                    <td className="px-4 py-3 align-middle text-[10px] uppercase tracking-label text-ink-mid">
                      {t.kind === "AUTO" ? "Auto" : "Review"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-middle font-display text-[14px] text-ink">
                      +{t.points.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {t._count.claims > 0 ? (
                        <span className="inline-flex items-center bg-vermilion/10 px-2 py-0.5 text-[11px] uppercase tracking-label text-vermilion">
                          {t._count.claims} waiting
                        </span>
                      ) : (
                        <span className="text-[11px] text-ink-mid">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-right">
                      <form action={toggleTaskActiveAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <input
                          type="hidden"
                          name="nextActive"
                          value={(!t.isActive).toString()}
                        />
                        <button
                          type="submit"
                          className={
                            t.isActive
                              ? "text-[11px] uppercase tracking-label text-sage hover:text-sage/80"
                              : "text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
                          }
                        >
                          {t.isActive ? "Active" : "Inactive"}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 align-middle text-right">
                      <Link
                        href={`/admin/loyalty/tasks/${t.id}`}
                        className="text-[11px] uppercase tracking-label text-ink-mid hover:text-vermilion"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-12 border-t border-ink/10 pt-10">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-vermilion" />
          <h2 className="font-display text-[20px] text-ink">Add a task</h2>
        </div>
        <p className="mt-1 text-[13px] text-ink-mid">
          Most tasks should be MANUAL_REVIEW. AUTO tasks need code that
          references their slug — only useful for built-ins.
        </p>
        <TaskForm />
      </section>
    </div>
  );
}
