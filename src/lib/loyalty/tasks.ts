// ─────────────────────────────────────────────────────────────────────────
// Tasks lifecycle — list / submit / approve / reject.
//
// Task taxonomy (LoyaltyTaskKind):
//   AUTO          — points awarded by code (place-order, birthday). The
//                   row exists purely so the customer sees "you can earn
//                   X by doing Y" in the drawer; submission is impossible.
//   MANUAL_REVIEW — customer clicks the task → fills proof URL + note →
//                   admin reviews on /admin/loyalty/tasks/claims → approve
//                   awards points; reject does nothing but emails the
//                   reason.
//
// First-touch behaviour: lazily seed two default AUTO rows (place-order +
// celebrate-birthday) so the customer drawer renders something on a
// fresh install. an admin can edit text/points or add new tasks any time.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  LoyaltyTaskKind,
  LoyaltyTaskClaimStatus,
  LoyaltyEventKind,
  type LoyaltyTask,
  type LoyaltyTaskClaim,
} from "@prisma/client";
import { applyLoyaltyEvent } from "./account";
import { getLoyaltySettings } from "./settings";

// Default seeds — minimal copy, tuneable from admin once seeded.
const DEFAULT_TASKS: Array<{
  slug: string;
  title: string;
  description: string;
  points: number;
  kind: LoyaltyTaskKind;
  iconKey: string;
  requiresProofUrl: boolean;
  isRepeatable: boolean;
  sortOrder: number;
}> = [
  {
    slug: "place-order",
    title: "Place an order",
    description: "Earn 5 points for every €1 spent.",
    points: 0, // 0 here means "variable" — real award comes from accrueOrderPoints
    kind: LoyaltyTaskKind.AUTO,
    iconKey: "cart",
    requiresProofUrl: false,
    isRepeatable: true,
    sortOrder: 0,
  },
  {
    slug: "celebrate-birthday",
    title: "Celebrate your birthday",
    description: "Bonus points on your birthday — make sure your DOB is set.",
    points: 150,
    kind: LoyaltyTaskKind.AUTO,
    iconKey: "cake",
    requiresProofUrl: false,
    isRepeatable: true,
    sortOrder: 1,
  },
];

async function seedDefaultTasksIfMissing(): Promise<void> {
  const count = await prisma.loyaltyTask.count();
  if (count > 0) return;
  await prisma.loyaltyTask.createMany({
    data: DEFAULT_TASKS,
    skipDuplicates: true,
  });
}

// ────────── customer-facing list ─────────────────────────────────────────

export type TaskWithStatus = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  points: number;
  kind: LoyaltyTaskKind;
  iconKey: string | null;
  requiresProofUrl: boolean;
  isRepeatable: boolean;
  /** Customer's relationship with this task:
   *   · "auto"      — AUTO task, no submission needed (decorative)
   *   · "available" — MANUAL_REVIEW + customer can claim
   *   · "pending"   — has a PENDING claim awaiting review
   *   · "approved"  — already approved (relevant only if !isRepeatable) */
  status: "auto" | "available" | "pending" | "approved";
};

export async function listTasksForUser(opts: {
  userId: string;
}): Promise<TaskWithStatus[]> {
  await seedDefaultTasksIfMissing();

  const [tasks, claims] = await Promise.all([
    prisma.loyaltyTask.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.loyaltyTaskClaim.findMany({
      where: {
        userId: opts.userId,
        status: {
          in: [LoyaltyTaskClaimStatus.PENDING, LoyaltyTaskClaimStatus.APPROVED],
        },
      },
      select: { taskId: true, status: true },
    }),
  ]);

  // Group claim statuses per task. Pending wins over approved for
  // display since it's the more actionable state.
  const claimByTask = new Map<string, "pending" | "approved">();
  for (const c of claims) {
    const prev = claimByTask.get(c.taskId);
    if (prev === "pending") continue;
    claimByTask.set(
      c.taskId,
      c.status === LoyaltyTaskClaimStatus.PENDING ? "pending" : "approved",
    );
  }

  return tasks.map((t): TaskWithStatus => {
    if (t.kind === LoyaltyTaskKind.AUTO) {
      return { ...trim(t), status: "auto" };
    }
    const claim = claimByTask.get(t.id);
    if (claim === "pending") return { ...trim(t), status: "pending" };
    if (claim === "approved" && !t.isRepeatable) {
      return { ...trim(t), status: "approved" };
    }
    return { ...trim(t), status: "available" };
  });
}

function trim(t: LoyaltyTask) {
  return {
    id: t.id,
    slug: t.slug,
    title: t.title,
    description: t.description,
    points: t.points,
    kind: t.kind,
    iconKey: t.iconKey,
    requiresProofUrl: t.requiresProofUrl,
    isRepeatable: t.isRepeatable,
  };
}

/** Look up by slug for the per-task page. */
export async function getTaskWithUserStatus(opts: {
  slug: string;
  userId: string;
}): Promise<{
  task: LoyaltyTask;
  status: "auto" | "available" | "pending" | "approved";
  latestClaim: LoyaltyTaskClaim | null;
} | null> {
  const task = await prisma.loyaltyTask.findUnique({
    where: { slug: opts.slug },
  });
  if (!task || !task.isActive) return null;

  const latestClaim = await prisma.loyaltyTaskClaim.findFirst({
    where: { taskId: task.id, userId: opts.userId },
    orderBy: { createdAt: "desc" },
  });

  let status: "auto" | "available" | "pending" | "approved" = "available";
  if (task.kind === LoyaltyTaskKind.AUTO) status = "auto";
  else if (latestClaim?.status === LoyaltyTaskClaimStatus.PENDING)
    status = "pending";
  else if (
    latestClaim?.status === LoyaltyTaskClaimStatus.APPROVED &&
    !task.isRepeatable
  )
    status = "approved";

  return { task, status, latestClaim };
}

// ────────── submit (customer) ────────────────────────────────────────────

export type SubmitResult =
  | { ok: true; claimId: string }
  | {
      ok: false;
      reason:
        | "task-not-found"
        | "task-inactive"
        | "task-not-claimable"
        | "already-pending"
        | "already-approved"
        | "missing-proof"
        | "program-paused";
    };

/** Customer submits proof for a MANUAL_REVIEW task. Idempotent in the
 *  "already pending" sense — returns the existing claim ID rather than
 *  letting the customer spam pending submissions. */
export async function submitTaskClaim(opts: {
  userId: string;
  slug: string;
  proofUrl?: string | null;
  notes?: string | null;
}): Promise<SubmitResult> {
  const settings = await getLoyaltySettings();
  if (!settings.isProgramActive) {
    return { ok: false, reason: "program-paused" };
  }

  const task = await prisma.loyaltyTask.findUnique({
    where: { slug: opts.slug },
  });
  if (!task) return { ok: false, reason: "task-not-found" };
  if (!task.isActive) return { ok: false, reason: "task-inactive" };
  if (task.kind !== LoyaltyTaskKind.MANUAL_REVIEW) {
    return { ok: false, reason: "task-not-claimable" };
  }
  if (task.requiresProofUrl && !opts.proofUrl?.trim()) {
    return { ok: false, reason: "missing-proof" };
  }

  // De-dup: if there's already a PENDING claim from this user for this
  // task, bounce them back to the existing one. Likewise for non-
  // repeatable tasks already APPROVED.
  const existing = await prisma.loyaltyTaskClaim.findFirst({
    where: {
      userId: opts.userId,
      taskId: task.id,
      status: {
        in: [LoyaltyTaskClaimStatus.PENDING, LoyaltyTaskClaimStatus.APPROVED],
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    if (existing.status === LoyaltyTaskClaimStatus.PENDING) {
      return { ok: false, reason: "already-pending" };
    }
    if (
      existing.status === LoyaltyTaskClaimStatus.APPROVED &&
      !task.isRepeatable
    ) {
      return { ok: false, reason: "already-approved" };
    }
  }

  const claim = await prisma.loyaltyTaskClaim.create({
    data: {
      taskId: task.id,
      userId: opts.userId,
      status: LoyaltyTaskClaimStatus.PENDING,
      proofUrl: opts.proofUrl?.trim() || null,
      notes: opts.notes?.trim() || null,
    },
  });

  return { ok: true, claimId: claim.id };
}

// ────────── approve / reject (admin) ─────────────────────────────────────

export type ReviewResult =
  | { ok: true; pointsAwarded: number }
  | {
      ok: false;
      reason: "claim-not-found" | "already-decided" | "task-missing";
    };

/** Approve a claim → award task.points, flip status, stamp reviewer. The
 *  same admin clicking Approve twice gets an "already-decided" no-op
 *  rather than double-awarding. */
export async function approveTaskClaim(opts: {
  claimId: string;
  reviewerId: string;
  adminNote?: string | null;
}): Promise<ReviewResult> {
  const claim = await prisma.loyaltyTaskClaim.findUnique({
    where: { id: opts.claimId },
    include: { task: true, user: { select: { id: true, firstName: true } } },
  });
  if (!claim) return { ok: false, reason: "claim-not-found" };
  if (claim.status !== LoyaltyTaskClaimStatus.PENDING) {
    return { ok: false, reason: "already-decided" };
  }
  if (!claim.task) return { ok: false, reason: "task-missing" };

  const points = claim.task.points;

  await prisma.$transaction([
    prisma.loyaltyTaskClaim.update({
      where: { id: claim.id },
      data: {
        status: LoyaltyTaskClaimStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedById: opts.reviewerId,
        adminNote: opts.adminNote ?? null,
      },
    }),
  ]);

  if (points > 0) {
    await applyLoyaltyEvent({
      userId: claim.user.id,
      firstName: claim.user.firstName,
      kind: LoyaltyEventKind.EARNED_TASK,
      delta: points,
      reason: `Task approved: ${claim.task.title}`,
      taskClaimId: claim.id,
    });
  }

  return { ok: true, pointsAwarded: points };
}

export async function rejectTaskClaim(opts: {
  claimId: string;
  reviewerId: string;
  adminNote: string;
}): Promise<ReviewResult> {
  const claim = await prisma.loyaltyTaskClaim.findUnique({
    where: { id: opts.claimId },
    include: { task: true },
  });
  if (!claim) return { ok: false, reason: "claim-not-found" };
  if (claim.status !== LoyaltyTaskClaimStatus.PENDING) {
    return { ok: false, reason: "already-decided" };
  }
  if (!claim.task) return { ok: false, reason: "task-missing" };

  await prisma.loyaltyTaskClaim.update({
    where: { id: claim.id },
    data: {
      status: LoyaltyTaskClaimStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedById: opts.reviewerId,
      adminNote: opts.adminNote,
    },
  });

  return { ok: true, pointsAwarded: 0 };
}
