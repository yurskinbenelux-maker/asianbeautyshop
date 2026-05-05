"use server";

// ─────────────────────────────────────────────────────────────────────────
// LoyaltyReward CRUD — define what customers can spend points on.
//
// Validation enforces the kind ↔ field invariants:
//   PRODUCT_FREE   → productId required, valueCents/percentOff ignored
//   GIFT_CARD      → valueCents required (in cents)
//   COUPON_FIXED   → valueCents required
//   COUPON_PERCENT → percentOff required (1..99)
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";
import { LoyaltyRewardKind } from "@prisma/client";

const RewardKindEnum = z.nativeEnum(LoyaltyRewardKind);

const RewardSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(120),
    description: z.string().max(500).optional().nullable(),
    kind: RewardKindEnum,
    pointsCost: z.coerce.number().int().min(1).max(1_000_000),
    productId: z.string().uuid().optional().nullable(),
    /** Stored in cents on save; the form takes EUR and we convert. */
    valueEur: z.coerce.number().min(0).max(10_000).optional().nullable(),
    percentOff: z.coerce.number().int().min(0).max(99).optional().nullable(),
    iconKey: z.string().max(40).optional().nullable(),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    isActive: z.coerce.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "PRODUCT_FREE" && !data.productId) {
      ctx.addIssue({
        code: "custom",
        message: "Pick a product for a free-product reward.",
        path: ["productId"],
      });
    }
    if (
      (data.kind === "GIFT_CARD" || data.kind === "COUPON_FIXED") &&
      (data.valueEur == null || data.valueEur <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Enter the euro value (greater than 0).",
        path: ["valueEur"],
      });
    }
    if (
      data.kind === "COUPON_PERCENT" &&
      (data.percentOff == null || data.percentOff < 1)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a percentage between 1 and 99.",
        path: ["percentOff"],
      });
    }
  });

export type SaveRewardResult = { ok: boolean; message?: string };

export async function saveRewardAction(
  formData: FormData,
): Promise<SaveRewardResult> {
  await requireCapability("loyalty.edit");

  const idRaw = formData.get("id");
  const productIdRaw = formData.get("productId");

  const parsed = RewardSchema.safeParse({
    id: idRaw && String(idRaw).length > 0 ? String(idRaw) : undefined,
    title: formData.get("title"),
    description: formData.get("description") || null,
    kind: formData.get("kind"),
    pointsCost: formData.get("pointsCost"),
    productId:
      productIdRaw && String(productIdRaw).length > 0
        ? String(productIdRaw)
        : null,
    valueEur: formData.get("valueEur") || null,
    percentOff: formData.get("percentOff") || null,
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

  const d = parsed.data;
  const data = {
    title: d.title,
    description: d.description ?? null,
    kind: d.kind,
    pointsCost: d.pointsCost,
    productId: d.kind === "PRODUCT_FREE" ? d.productId : null,
    valueCents:
      d.kind === "GIFT_CARD" || d.kind === "COUPON_FIXED"
        ? Math.round((d.valueEur ?? 0) * 100)
        : null,
    percentOff: d.kind === "COUPON_PERCENT" ? d.percentOff : null,
    iconKey: d.iconKey ?? null,
    sortOrder: d.sortOrder,
    isActive: d.isActive,
  };

  if (d.id) {
    await prisma.loyaltyReward.update({ where: { id: d.id }, data });
  } else {
    await prisma.loyaltyReward.create({ data });
  }

  revalidatePath("/admin/loyalty/rewards");
  return { ok: true, message: "Saved." };
}

export async function toggleRewardActiveAction(formData: FormData) {
  await requireCapability("loyalty.edit");
  const id = String(formData.get("id") ?? "");
  const next = formData.get("nextActive") === "true";
  if (!id) return;
  await prisma.loyaltyReward.update({
    where: { id },
    data: { isActive: next },
  });
  revalidatePath("/admin/loyalty/rewards");
}
