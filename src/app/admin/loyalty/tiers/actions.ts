"use server";

// ─────────────────────────────────────────────────────────────────────────
// Tier CRUD — create / update / soft-deactivate.
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";

const TierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(40),
  pointsThreshold: z.coerce.number().int().min(0).max(1_000_000),
  iconKey: z.string().max(40).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(999),
  isActive: z.coerce.boolean(),
});

export type SaveTierResult = { ok: boolean; message?: string };

export async function saveTierAction(
  formData: FormData,
): Promise<SaveTierResult> {
  await requireCapability("loyalty.edit");

  const idRaw = formData.get("id");
  const parsed = TierSchema.safeParse({
    id: idRaw && String(idRaw).length > 0 ? String(idRaw) : undefined,
    name: formData.get("name"),
    pointsThreshold: formData.get("pointsThreshold"),
    iconKey: formData.get("iconKey") || null,
    sortOrder: formData.get("sortOrder") ?? 0,
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { id, ...data } = parsed.data;
  if (id) {
    await prisma.loyaltyTier.update({ where: { id }, data });
  } else {
    await prisma.loyaltyTier.create({ data });
  }

  revalidatePath("/admin/loyalty/tiers");
  return { ok: true, message: "Saved." };
}

/** Soft-deactivate. We don't hard-delete because LoyaltyEvent reasons +
 *  customer drawer history may reference the tier name. */
export async function toggleTierActiveAction(formData: FormData) {
  await requireCapability("loyalty.edit");
  const id = String(formData.get("id") ?? "");
  const next = formData.get("nextActive") === "true";
  if (!id) return;

  await prisma.loyaltyTier.update({
    where: { id },
    data: { isActive: next },
  });
  revalidatePath("/admin/loyalty/tiers");
}
