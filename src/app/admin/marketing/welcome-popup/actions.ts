// ─────────────────────────────────────────────────────────────────────────
// Save the welcome-popup config from /admin/marketing/welcome-popup.
//
// All fields go through Zod for length caps; unknown fields are dropped.
// On success we redirect with ?saved=1 so the page renders a success
// toast and an admin can immediately verify her change on the homepage.
//
// Bust the public layout cache so the popup picks up the new copy/image
// without an admin having to hard-refresh.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCapability } from "@/lib/auth-roles";
import {
  writeWelcomePopupSettings,
  type WelcomePopupSettings,
} from "@/lib/queries/welcome-popup";

// Checkboxes only POST when checked, so we treat any non-undefined as
// truthy. Field schemas trim whitespace so leading/trailing spaces don't
// drift in over edits.
const Schema = z.object({
  enabled: z.union([z.string(), z.undefined()]).transform((v) => v !== undefined),
  delaySeconds: z.coerce.number().int().min(0).max(60),
  imageUrl: z.string().trim().max(2000).optional().default(""),
  imageAlt: z.string().trim().max(300).optional().default(""),
  eyebrow: z.string().trim().max(60).optional().default(""),
  bigOffer: z.string().trim().max(20).optional().default(""),
  bigOfferSubtitle: z.string().trim().max(80).optional().default(""),
  // Headline allows a tiny HTML allowlist (just <em>) — we don't strip
  // it on save; the read-side passes through to the JSX with a single
  // dangerouslySetInnerHTML, scoped to this admin-only edit surface.
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

export async function saveWelcomePopupAction(
  formData: FormData,
): Promise<void> {
  await requireCapability("homepage.edit", "/admin");

  const parsed = Schema.parse(Object.fromEntries(formData));

  const next: WelcomePopupSettings = {
    enabled: parsed.enabled,
    delaySeconds: parsed.delaySeconds,
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

  await writeWelcomePopupSettings(next);

  // The popup is mounted in the public layout, so blow that cache.
  revalidatePath("/", "layout");
  redirect("/admin/marketing/welcome-popup?saved=1");
}
