// ─────────────────────────────────────────────────────────────────────────
// Save the central promotions config from /admin/marketing/promotions.
//
// All four fields are integers — Zod coerces from FormData strings and
// clamps to safe bounds. Saving busts the public layout cache so the
// next page load reflects the new percentages everywhere they're shown.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCapability } from "@/lib/auth-roles";
import {
  writePromoSettings,
  type PromoSettings,
} from "@/lib/queries/promotions";

const Schema = z.object({
  registrationWelcomePct: z.coerce.number().int().min(0).max(50),
  registrationWelcomeValidDays: z.coerce.number().int().min(1).max(365),
  quizRewardPct: z.coerce.number().int().min(0).max(50),
  quizRewardValidDays: z.coerce.number().int().min(1).max(365),
});

export async function savePromotionsAction(
  formData: FormData,
): Promise<void> {
  await requireCapability("homepage.edit", "/admin");

  const parsed = Schema.parse(Object.fromEntries(formData));

  const next: PromoSettings = {
    registrationWelcomePct: parsed.registrationWelcomePct,
    registrationWelcomeValidDays: parsed.registrationWelcomeValidDays,
    quizRewardPct: parsed.quizRewardPct,
    quizRewardValidDays: parsed.quizRewardValidDays,
  };

  await writePromoSettings(next);

  // The popup, exit-intent, quiz card, etc. all read these values when
  // the layout renders. Bust the public cache so they refresh.
  revalidatePath("/", "layout");
  redirect("/admin/marketing/promotions?saved=1");
}
