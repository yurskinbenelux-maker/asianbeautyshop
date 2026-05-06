// ─────────────────────────────────────────────────────────────────────────
// Save the quiz-popup config from /admin/marketing/quiz-popup. Mirror
// of the welcome-popup save action with one extra field (the
// after-welcome delay).
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCapability } from "@/lib/auth-roles";
import {
  writeQuizPopupSettings,
  type QuizPopupSettings,
} from "@/lib/queries/quiz-popup";

const Schema = z.object({
  enabled: z.union([z.string(), z.undefined()]).transform((v) => v !== undefined),
  delaySecondsAfterWelcome: z.coerce.number().int().min(0).max(300),
  imageUrl: z.string().trim().max(2000).optional().default(""),
  imageAlt: z.string().trim().max(300).optional().default(""),
  eyebrow: z.string().trim().max(60).optional().default(""),
  bigOffer: z.string().trim().max(20).optional().default(""),
  bigOfferSubtitle: z.string().trim().max(80).optional().default(""),
  headline: z.string().trim().max(200).optional().default(""),
  body: z.string().trim().max(600).optional().default(""),
  bonus1Enabled: z
    .union([z.string(), z.undefined()])
    .transform((v) => v !== undefined),
  bonus1Pct: z.string().trim().max(20).optional().default(""),
  bonus1Text: z.string().trim().max(300).optional().default(""),
  bonus2Enabled: z
    .union([z.string(), z.undefined()])
    .transform((v) => v !== undefined),
  bonus2Text: z.string().trim().max(300).optional().default(""),
  ctaLabel: z.string().trim().max(80).optional().default(""),
  ctaHref: z.string().trim().max(2000).optional().default(""),
  showNoThanks: z
    .union([z.string(), z.undefined()])
    .transform((v) => v !== undefined),
});

export async function saveQuizPopupAction(
  formData: FormData,
): Promise<void> {
  await requireCapability("homepage.edit", "/admin");

  const parsed = Schema.parse(Object.fromEntries(formData));

  const next: QuizPopupSettings = {
    enabled: parsed.enabled,
    delaySecondsAfterWelcome: parsed.delaySecondsAfterWelcome,
    imageUrl: parsed.imageUrl,
    imageAlt: parsed.imageAlt,
    eyebrow: parsed.eyebrow,
    bigOffer: parsed.bigOffer,
    bigOfferSubtitle: parsed.bigOfferSubtitle,
    headline: parsed.headline,
    body: parsed.body,
    bonus1Enabled: parsed.bonus1Enabled,
    bonus1Pct: parsed.bonus1Pct,
    bonus1Text: parsed.bonus1Text,
    bonus2Enabled: parsed.bonus2Enabled,
    bonus2Text: parsed.bonus2Text,
    ctaLabel: parsed.ctaLabel,
    ctaHref: parsed.ctaHref,
    showNoThanks: parsed.showNoThanks,
  };

  await writeQuizPopupSettings(next);

  revalidatePath("/", "layout");
  redirect("/admin/marketing/quiz-popup?saved=1");
}
