// ─────────────────────────────────────────────────────────────────────────
// Welcome popup config — Sofia edits every field from
// /admin/marketing/welcome-popup. Stored as a single Setting row keyed
// `marketing.welcome_popup`.
//
// The popup itself (src/components/marketing/register-welcome-popup.tsx)
// reads these settings on the server (in src/app/[locale]/layout.tsx)
// and passes them down to the client component, so the on-load modal
// renders with whatever copy and image Sofia last saved.
//
// Read returns sane defaults so a fresh DB still shows the canonical
// English popup out of the box. Field shape is forward-compatible —
// missing keys fall through to the defaults. Corrupt JSON never crashes
// the layout (we wrap in try/catch and log).
//
// Backed by the existing `Setting` table — no migration required.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SETTING_KEY = "marketing.welcome_popup";

/**
 * Everything Sofia can tweak from the admin form. The frontend popup
 * reads this verbatim — no further transformation.
 */
export type WelcomePopupSettings = {
  /** Master kill-switch. False → popup never renders (regardless of
   *  cookie state, route, etc). Lets Sofia pause it during a campaign. */
  enabled: boolean;

  /** Public URL of the image shown on the LEFT side of the card.
   *  Empty string → image column is hidden and the card collapses to
   *  single-column (current single-column layout). */
  imageUrl: string;
  /** Alt text for accessibility + SEO. Required if imageUrl is set. */
  imageAlt: string;

  /** Small uppercase label above the big number. e.g. "Welcome gift" */
  eyebrow: string;

  /** The big italic number — kept editable in case Sofia wants to
   *  restyle it ("FREE", "−15%", "GIFT"). Phase 2 will tie this to
   *  the central promotions setting; for Phase 1 it's free-text. */
  bigOffer: string;
  /** Sub-label under the big number. e.g. "on your first order" */
  bigOfferSubtitle: string;

  /** Headline — supports `<em>YU.R</em>` markup for the italic
   *  vermilion emphasis on the brand name. Sofia writes raw HTML
   *  but we sanitise to a small allowlist on save. */
  headline: string;

  /** Body paragraph below the headline. Plain text only. */
  body: string;

  // ── Bonus block 1 (the +15% quiz reward, vermilion) ─────────────────
  bonus1Enabled: boolean;
  bonus1Pct: string;        // e.g. "+15%" — phase 2 will read from promotions
  bonus1Text: string;       // e.g. "extra after you register, when you take the **skin quiz**"

  // ── Bonus block 2 (the YurClub points, sage) ────────────────────────
  bonus2Enabled: boolean;
  bonus2Text: string;       // e.g. "Earn points with **YurClub** — redeem for free products"

  // ── CTA button ──────────────────────────────────────────────────────
  ctaLabel: string;
  ctaHref: string;          // defaults to /en/sign-up

  /** Whether to render the small "No thanks" link at the bottom.
   *  Some marketers like to remove this to push for the close X
   *  (which still works — same dismissal). */
  showNoThanks: boolean;
};

export const WELCOME_POPUP_DEFAULTS: WelcomePopupSettings = {
  enabled: true,
  imageUrl: "",
  imageAlt: "",
  eyebrow: "Welcome gift",
  bigOffer: "−10%",
  bigOfferSubtitle: "on your first order",
  headline: "Create your <em>YU.R</em> account.",
  body: "Register in under a minute and we'll send a 10% off code straight to your inbox — plus order tracking, saved addresses, and your skin-quiz results next time you visit.",
  bonus1Enabled: true,
  bonus1Pct: "+15%",
  bonus1Text: "extra after you register, when you take the **skin quiz** — applied to the personalised routine we recommend.",
  bonus2Enabled: true,
  bonus2Text: "Earn points on every purchase with **YurClub** — redeem for free products and member-only coupons. Free to join.",
  ctaLabel: "Create my account",
  ctaHref: "/en/sign-up",
  showNoThanks: true,
};

/** Coerce an unknown JSON value to a string, defaulting to empty.
 *  Same pattern as home-hero.ts — keeps reads robust. */
function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export async function readWelcomePopupSettings(): Promise<WelcomePopupSettings> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
      select: { valueJson: true },
    });
    if (!row) return WELCOME_POPUP_DEFAULTS;

    const v = row.valueJson as Record<string, unknown> | null;
    if (!v || typeof v !== "object") return WELCOME_POPUP_DEFAULTS;

    return {
      enabled: asBool(v.enabled, WELCOME_POPUP_DEFAULTS.enabled),
      imageUrl: asString(v.imageUrl, WELCOME_POPUP_DEFAULTS.imageUrl),
      imageAlt: asString(v.imageAlt, WELCOME_POPUP_DEFAULTS.imageAlt),
      eyebrow: asString(v.eyebrow, WELCOME_POPUP_DEFAULTS.eyebrow),
      bigOffer: asString(v.bigOffer, WELCOME_POPUP_DEFAULTS.bigOffer),
      bigOfferSubtitle: asString(
        v.bigOfferSubtitle,
        WELCOME_POPUP_DEFAULTS.bigOfferSubtitle,
      ),
      headline: asString(v.headline, WELCOME_POPUP_DEFAULTS.headline),
      body: asString(v.body, WELCOME_POPUP_DEFAULTS.body),
      bonus1Enabled: asBool(
        v.bonus1Enabled,
        WELCOME_POPUP_DEFAULTS.bonus1Enabled,
      ),
      bonus1Pct: asString(v.bonus1Pct, WELCOME_POPUP_DEFAULTS.bonus1Pct),
      bonus1Text: asString(v.bonus1Text, WELCOME_POPUP_DEFAULTS.bonus1Text),
      bonus2Enabled: asBool(
        v.bonus2Enabled,
        WELCOME_POPUP_DEFAULTS.bonus2Enabled,
      ),
      bonus2Text: asString(v.bonus2Text, WELCOME_POPUP_DEFAULTS.bonus2Text),
      ctaLabel: asString(v.ctaLabel, WELCOME_POPUP_DEFAULTS.ctaLabel),
      ctaHref: asString(v.ctaHref, WELCOME_POPUP_DEFAULTS.ctaHref),
      showNoThanks: asBool(
        v.showNoThanks,
        WELCOME_POPUP_DEFAULTS.showNoThanks,
      ),
    };
  } catch (err) {
    console.error("[welcome-popup] read failed, using defaults", err);
    return WELCOME_POPUP_DEFAULTS;
  }
}

export async function writeWelcomePopupSettings(
  next: WelcomePopupSettings,
): Promise<void> {
  // Prisma's Json field expects InputJsonValue; our struct serialises
  // cleanly to JSON, so the cast is safe.
  const json = next as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: json },
    update: { valueJson: json },
  });
}
