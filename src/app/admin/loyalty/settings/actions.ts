"use server";

// ─────────────────────────────────────────────────────────────────────────
// LoyaltySettings save action — singleton edit.
//
// All fields validated as integers + booleans (no Decimal inputs because
// we keep the customer-facing math in whole points). Saves the singleton
// row with id-by-singleton; race-tolerant via the unique constraint on
// `singleton`.
// ─────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";
import { LOYALTY_DEFAULTS } from "@/lib/loyalty/settings";

const InputSchema = z.object({
  pointsPerEur: z.coerce.number().int().min(0).max(1000),
  birthdayPoints: z.coerce.number().int().min(0).max(100000),
  milestoneOrders: z.coerce.number().int().min(1).max(1000),
  milestonePoints: z.coerce.number().int().min(0).max(100000),
  milestoneEnabled: z.coerce.boolean(),
  referrerBonus: z.coerce.number().int().min(0).max(100000),
  refereeCouponPercent: z.coerce.number().int().min(0).max(99),
  pointsExpiryMonths: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0).max(120).nullable(),
  ),
  couponExpiryReminderDays: z.coerce.number().int().min(0).max(60),
  isProgramActive: z.coerce.boolean(),
});

export type SaveLoyaltySettingsResult = {
  ok: boolean;
  message?: string;
};

export async function saveLoyaltySettingsAction(
  formData: FormData,
): Promise<SaveLoyaltySettingsResult> {
  await requireCapability("loyalty.edit");

  // FormData booleans arrive as the string "on" when checked or absent
  // when unchecked — coerce both to a real bool before zod sees it.
  const raw = {
    pointsPerEur: formData.get("pointsPerEur"),
    birthdayPoints: formData.get("birthdayPoints"),
    milestoneOrders: formData.get("milestoneOrders"),
    milestonePoints: formData.get("milestonePoints"),
    milestoneEnabled: formData.get("milestoneEnabled") === "on",
    referrerBonus: formData.get("referrerBonus"),
    refereeCouponPercent: formData.get("refereeCouponPercent"),
    pointsExpiryMonths: formData.get("pointsExpiryMonths"),
    couponExpiryReminderDays: formData.get("couponExpiryReminderDays"),
    isProgramActive: formData.get("isProgramActive") === "on",
  };

  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  // Upsert the singleton. The unique constraint on `singleton: true`
  // means at most one row exists; we update by that key.
  await prisma.loyaltySettings.upsert({
    where: { singleton: true },
    update: parsed.data,
    create: { singleton: true, ...LOYALTY_DEFAULTS, ...parsed.data },
  });

  revalidatePath("/admin/loyalty");
  revalidatePath("/admin/loyalty/settings");
  return { ok: true, message: "Saved." };
}
