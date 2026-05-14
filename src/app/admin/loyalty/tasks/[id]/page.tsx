// ─────────────────────────────────────────────────────────────────────────
// /admin/loyalty/tasks/[id] — edit one task.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";
import { TaskForm } from "../form";

export const dynamic = "force-dynamic";

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapability("loyalty.edit");
  const { id } = await params;
  const task = await prisma.loyaltyTask.findUnique({ where: { id } });
  if (!task) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/admin/loyalty/tasks"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        All tasks
      </Link>
      <h1 className="mt-3 font-display text-[28px] leading-tight text-ink">
        Edit {task.title}
      </h1>
      <TaskForm initial={task} />
    </div>
  );
}
