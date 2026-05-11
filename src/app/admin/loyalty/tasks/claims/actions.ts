"use server";

// ─────────────────────────────────────────────────────────────────────────
// Admin actions for reviewing manual-task claims.
//
// Both approve + reject also fire the localised decision email to the
// customer. Email failures don't undo the DB write — points are real
// either way; a stuck email is a follow-up an admin can resend manually.
// ─────────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";
import { getCurrentCustomer } from "@/lib/auth";
import {
  approveTaskClaim,
  rejectTaskClaim,
} from "@/lib/loyalty/tasks";
import { sendLoyaltyTaskDecisionEmail } from "@/lib/email/loyalty-task-decision";
import { Locale } from "@prisma/client";

const ApproveSchema = z.object({
  claimId: z.string().uuid(),
  adminNote: z.string().max(500).optional().nullable(),
});

const RejectSchema = z.object({
  claimId: z.string().uuid(),
  adminNote: z.string().min(1).max(500),
});

export async function approveClaimAction(formData: FormData) {
  await requireCapability("loyalty.edit");
  const reviewer = await getCurrentCustomer();
  if (!reviewer) return;

  const parsed = ApproveSchema.safeParse({
    claimId: formData.get("claimId"),
    adminNote: formData.get("adminNote") || null,
  });
  if (!parsed.success) return;

  const claim = await prisma.loyaltyTaskClaim.findUnique({
    where: { id: parsed.data.claimId },
    include: {
      task: { select: { title: true } },
      user: {
        select: { email: true, firstName: true, preferredLocale: true },
      },
    },
  });
  if (!claim || !claim.task) return;

  const result = await approveTaskClaim({
    claimId: parsed.data.claimId,
    reviewerId: reviewer.profile.id,
    adminNote: parsed.data.adminNote,
  });

  if (result.ok) {
    // Fire-and-forget email. Wrapped in try because Resend not being
    // configured shouldn't block a real-world admin action.
    void sendLoyaltyTaskDecisionEmail({
      email: claim.user.email,
      firstName: claim.user.firstName,
      locale: claim.user.preferredLocale ?? Locale.EN,
      taskTitle: claim.task.title,
      decision: "approved",
      pointsAwarded: result.pointsAwarded,
    }).catch((err) =>
      console.error("[loyalty/claims] approve email failed", err),
    );
  }

  revalidatePath("/admin/loyalty");
  revalidatePath("/admin/loyalty/tasks");
  revalidatePath("/admin/loyalty/tasks/claims");
}

export async function rejectClaimAction(formData: FormData) {
  await requireCapability("loyalty.edit");
  const reviewer = await getCurrentCustomer();
  if (!reviewer) return;

  const parsed = RejectSchema.safeParse({
    claimId: formData.get("claimId"),
    adminNote: formData.get("adminNote"),
  });
  if (!parsed.success) return;

  const claim = await prisma.loyaltyTaskClaim.findUnique({
    where: { id: parsed.data.claimId },
    include: {
      task: { select: { title: true } },
      user: {
        select: { email: true, firstName: true, preferredLocale: true },
      },
    },
  });
  if (!claim || !claim.task) return;

  const result = await rejectTaskClaim({
    claimId: parsed.data.claimId,
    reviewerId: reviewer.profile.id,
    adminNote: parsed.data.adminNote,
  });

  if (result.ok) {
    void sendLoyaltyTaskDecisionEmail({
      email: claim.user.email,
      firstName: claim.user.firstName,
      locale: claim.user.preferredLocale ?? Locale.EN,
      taskTitle: claim.task.title,
      decision: "rejected",
      reason: parsed.data.adminNote,
    }).catch((err) =>
      console.error("[loyalty/claims] reject email failed", err),
    );
  }

  revalidatePath("/admin/loyalty");
  revalidatePath("/admin/loyalty/tasks");
  revalidatePath("/admin/loyalty/tasks/claims");
}
