"use server";

// ─────────────────────────────────────────────────────────────────────────
// LoyaltyTask CRUD — define what customers can do to earn points.
//
// AUTO tasks fire from code (place-order, celebrate-birthday). MANUAL_REVIEW
// tasks let customers submit proof; admin approves them in Phase E.
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";
import { LoyaltyTaskKind } from "@prisma/client";

const TaskSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, {
    message: "Slug must be lowercase letters, numbers, and dashes only.",
  }),
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  instructionsHtml: z.string().max(8000).optional().nullable(),
  points: z.coerce.number().int().min(0).max(1_000_000),
  kind: z.nativeEnum(LoyaltyTaskKind),
  iconKey: z.string().max(40).optional().nullable(),
  requiresProofUrl: z.coerce.boolean(),
  isRepeatable: z.coerce.boolean(),
  isActive: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type SaveTaskResult = { ok: boolean; message?: string };

export async function saveTaskAction(
  formData: FormData,
): Promise<SaveTaskResult> {
  await requireCapability("loyalty.edit");

  const idRaw = formData.get("id");
  const parsed = TaskSchema.safeParse({
    id: idRaw && String(idRaw).length > 0 ? String(idRaw) : undefined,
    slug: formData.get("slug"),
    title: formData.get("title"),
    description: formData.get("description") || null,
    instructionsHtml: formData.get("instructionsHtml") || null,
    points: formData.get("points"),
    kind: formData.get("kind"),
    iconKey: formData.get("iconKey") || null,
    requiresProofUrl: formData.get("requiresProofUrl") === "on",
    isRepeatable: formData.get("isRepeatable") === "on",
    isActive: formData.get("isActive") === "on",
    sortOrder: formData.get("sortOrder") ?? 0,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { id, ...data } = parsed.data;
  try {
    if (id) {
      await prisma.loyaltyTask.update({ where: { id }, data });
    } else {
      await prisma.loyaltyTask.create({ data });
    }
  } catch (err: unknown) {
    // Slug collision is the most likely failure mode for create.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return { ok: false, message: "A task with that slug already exists." };
    }
    throw err;
  }

  revalidatePath("/admin/loyalty/tasks");
  return { ok: true, message: "Saved." };
}

export async function toggleTaskActiveAction(formData: FormData) {
  await requireCapability("loyalty.edit");
  const id = String(formData.get("id") ?? "");
  const next = formData.get("nextActive") === "true";
  if (!id) return;
  await prisma.loyaltyTask.update({
    where: { id },
    data: { isActive: next },
  });
  revalidatePath("/admin/loyalty/tasks");
}
