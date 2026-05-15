// ─────────────────────────────────────────────────────────────────────────
// Quiz popup config — an admin edits every field from
// /admin/marketing/quiz-popup. Fires AFTER the welcome popup is finished
// (closed, dismissed, or never-shown) plus a configurable delay (default
// 30s). Same single-Setting-row pattern as the welcome popup.
//
// Stored as `marketing.quiz_popup` in the existing Setting table.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SETTING_KEY = "marketing.quiz_popup";

/** Mirrors WelcomePopupSettings shape but with `delaySecondsAfterWelcome`
 *  instead of `delaySeconds` (the timer starts when the welcome popup
 *  signals it's done, not at page load). */
export type QuizPopupSettings = {
  enabled: boolean;
  /** Seconds to wait AFTER the welcome popup is finished (closed or
   *  skipped) before showing the quiz popup. Default 30. */
  delaySecondsAfterWelcome: number;

  imageUrl: string;
  imageAlt: string;
  /** CSS `object-position` value used at desktop breakpoints (md+).
   *  Examples: "center", "center top", "50% 30%", "30% center".
   *  Default "center" preserves auto-centred crop behaviour.
   *  Mirrors WelcomePopupSettings for symmetry — an admin sets one
   *  string per popup per viewport and the image element applies it. */
  imageObjectPositionDesktop: string;
  /** Mobile-specific object-position; usually wants to differ from
   *  desktop because the visible crop is taller (portrait container)
   *  vs the wider desktop slot. */
  imageObjectPositionMobile: string;

  eyebrow: string;
  bigOffer: string;
  bigOfferSubtitle: string;
  headline: string;
  body: string;

  bonus1Enabled: boolean;
  bonus1Pct: string;
  bonus1Text: string;

  bonus2Enabled: boolean;
  bonus2Text: string;

  ctaLabel: string;
  ctaHref: string;
  showNoThanks: boolean;
};

export const QUIZ_POPUP_DEFAULTS: QuizPopupSettings = {
  enabled: true,
  delaySecondsAfterWelcome: 30,
  imageUrl: "",
  imageAlt: "",
  imageObjectPositionDesktop: "center",
  imageObjectPositionMobile: "center",
  eyebrow: "Skin assessment",
  bigOffer: "+15%",
  bigOfferSubtitle: "your reward for taking the skin quiz",
  headline: "Discover your <em>routine</em>.",
  body: "Two minutes, seven questions. We pair the right products to your skin's exact needs and unlock 15% off the recommended set.",
  bonus1Enabled: true,
  bonus1Pct: "2 min",
  bonus1Text: "Built around Korean dermatology — quick to answer, designed by professionals.",
  bonus2Enabled: false,
  bonus2Text: "",
  ctaLabel: "Take the skin quiz",
  ctaHref: "/en/quiz",
  showNoThanks: true,
};

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asDelay(v: unknown, fallback: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, Math.round(n)));
}

export async function readQuizPopupSettings(): Promise<QuizPopupSettings> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
      select: { valueJson: true },
    });
    if (!row) return QUIZ_POPUP_DEFAULTS;

    const v = row.valueJson as Record<string, unknown> | null;
    if (!v || typeof v !== "object") return QUIZ_POPUP_DEFAULTS;

    return {
      enabled: asBool(v.enabled, QUIZ_POPUP_DEFAULTS.enabled),
      delaySecondsAfterWelcome: asDelay(
        v.delaySecondsAfterWelcome,
        QUIZ_POPUP_DEFAULTS.delaySecondsAfterWelcome,
        300,
      ),
      imageUrl: asString(v.imageUrl, QUIZ_POPUP_DEFAULTS.imageUrl),
      imageAlt: asString(v.imageAlt, QUIZ_POPUP_DEFAULTS.imageAlt),
      imageObjectPositionDesktop: asString(
        v.imageObjectPositionDesktop,
        QUIZ_POPUP_DEFAULTS.imageObjectPositionDesktop,
      ),
      imageObjectPositionMobile: asString(
        v.imageObjectPositionMobile,
        QUIZ_POPUP_DEFAULTS.imageObjectPositionMobile,
      ),
      eyebrow: asString(v.eyebrow, QUIZ_POPUP_DEFAULTS.eyebrow),
      bigOffer: asString(v.bigOffer, QUIZ_POPUP_DEFAULTS.bigOffer),
      bigOfferSubtitle: asString(
        v.bigOfferSubtitle,
        QUIZ_POPUP_DEFAULTS.bigOfferSubtitle,
      ),
      headline: asString(v.headline, QUIZ_POPUP_DEFAULTS.headline),
      body: asString(v.body, QUIZ_POPUP_DEFAULTS.body),
      bonus1Enabled: asBool(
        v.bonus1Enabled,
        QUIZ_POPUP_DEFAULTS.bonus1Enabled,
      ),
      bonus1Pct: asString(v.bonus1Pct, QUIZ_POPUP_DEFAULTS.bonus1Pct),
      bonus1Text: asString(v.bonus1Text, QUIZ_POPUP_DEFAULTS.bonus1Text),
      bonus2Enabled: asBool(
        v.bonus2Enabled,
        QUIZ_POPUP_DEFAULTS.bonus2Enabled,
      ),
      bonus2Text: asString(v.bonus2Text, QUIZ_POPUP_DEFAULTS.bonus2Text),
      ctaLabel: asString(v.ctaLabel, QUIZ_POPUP_DEFAULTS.ctaLabel),
      ctaHref: asString(v.ctaHref, QUIZ_POPUP_DEFAULTS.ctaHref),
      showNoThanks: asBool(
        v.showNoThanks,
        QUIZ_POPUP_DEFAULTS.showNoThanks,
      ),
    };
  } catch (err) {
    console.error("[quiz-popup] read failed, using defaults", err);
    return QUIZ_POPUP_DEFAULTS;
  }
}

export async function writeQuizPopupSettings(
  next: QuizPopupSettings,
): Promise<void> {
  const json = next as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: json },
    update: { valueJson: json },
  });
}
