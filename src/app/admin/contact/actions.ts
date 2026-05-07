// ─────────────────────────────────────────────────────────────────────────
// /admin/contact — moderation actions.
//
// All flows are idempotent: a double-click on "Mark as read" is harmless,
// and status changes preserve the existing value if it's already there.
//
// We keep messages forever by default. Admin can Archive to hide from the
// default NEW/READ list without losing audit trail. Hard-delete is not
// exposed here by design — if Sofia needs it, that's a separate, guarded
// action (out of scope for #89).
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ContactStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const STATUSES = ["NEW", "READ", "REPLIED", "ARCHIVED"] as const;

const SetStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});

/**
 * Flip the status of a single message. Called from both the list (bulk
 * "mark as read") and the detail view ("Mark as replied" / "Archive").
 */
export async function setContactStatus(formData: FormData) {
  await requireAdmin();

  const parsed = SetStatusSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    status: String(formData.get("status") ?? "").toUpperCase(),
  });
  if (!parsed.success) return;

  await prisma.contactMessage.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status as ContactStatus },
  });

  revalidatePath("/admin/contact");
  revalidatePath(`/admin/contact/${parsed.data.id}`);
}

/**
 * Opening the detail page implicitly bumps NEW → READ so the unread
 * badge on the sidebar stays accurate.  Kept as a separate action so
 * the detail page can call it from a Suspense boundary.
 */
export async function markAsReadIfNew(id: string): Promise<void> {
  await requireAdmin();

  await prisma.contactMessage.updateMany({
    where: { id, status: ContactStatus.NEW },
    data: { status: ContactStatus.READ },
  });

  revalidatePath("/admin/contact");
}

/**
 * Quick action from the detail view — jumps Sofia to her mail client with
 * the subject, To: and a threaded greeting pre-filled.
 */
export async function openReplyInMailClient(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const msg = await prisma.contactMessage.findUnique({
    where: { id },
    select: { email: true, name: true, subject: true, message: true },
  });
  if (!msg) return;

  // Flip to REPLIED as soon as Sofia hits "Reply" — the assumption is she
  // will actually reply; if she doesn't, she can toggle it back.
  await prisma.contactMessage.update({
    where: { id },
    data: { status: ContactStatus.REPLIED },
  });

  const subject = `Re: your message to Asian Beauty Shop`;
  const quoted = msg.message
    .split("\n")
    .map((line: string) => `> ${line}`)
    .join("\n");
  const body = `Hi ${msg.name},\n\n\n\n— Asian Beauty Shop\n\n${quoted}`;

  const mailto = `mailto:${encodeURIComponent(msg.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  revalidatePath("/admin/contact");
  revalidatePath(`/admin/contact/${id}`);
  redirect(mailto);
}
