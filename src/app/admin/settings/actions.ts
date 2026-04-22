// ─────────────────────────────────────────────────────────────────────────
// Server actions for /admin/settings.
//
// One action per section — each parses the form with Zod, writes a single
// Setting row, then revalidates the public site so downstream caches
// (checkout, SEO metadata, AI route) pick up the change on the next hit.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { writeSetting } from "@/lib/settings";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

function refresh(section: string) {
  revalidatePath("/admin/settings", "layout");
  // Public-site refresh is section-specific to avoid nuking more cache
  // than we need to. Store/SEO/AI all surface on /, shipping on /checkout.
  if (section === "shipping" || section === "tax") {
    revalidatePath("/", "layout");
    revalidatePath("/shop", "layout");
  } else {
    revalidatePath("/", "layout");
  }
}

function bad(msg: string, fieldErrors?: ActionState["fieldErrors"]): ActionState {
  return { ok: false, message: msg, fieldErrors };
}

/** Look up the admin's DB id so we can stamp Setting.updatedBy. */
async function adminIdFromEmail(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const row = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return row?.id ?? null;
}

// ═══════════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════════

const StoreSchema = z.object({
  name: z.string().trim().min(1, "Store name is required.").max(120),
  supportEmail: z
    .string()
    .trim()
    .email("Invalid email.")
    .max(200)
    .or(z.literal("").transform(() => "")),
  supportPhone: z.string().trim().max(40).optional().default(""),
  signOff: z.string().trim().max(500).optional().default(""),
});

export async function updateStoreSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();

  const parsed = StoreSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const adminId = await adminIdFromEmail(user.email);
  await writeSetting(
    "store",
    {
      name: parsed.data.name,
      supportEmail: parsed.data.supportEmail,
      supportPhone: parsed.data.supportPhone ?? "",
      signOff: parsed.data.signOff ?? "",
    },
    adminId,
  );

  refresh("store");
  return OK_SAVED;
}

// ═══════════════════════════════════════════════════════════════════════
// SHIPPING
// ═══════════════════════════════════════════════════════════════════════

const ShippingSchema = z.object({
  // Accept euros in the form ("7.50"), we store cents.
  freeThresholdEuros: z.coerce.number().min(0).max(10_000),
  flatRateEuros: z.coerce.number().min(0).max(1_000),
  // Comma/space-separated list of ISO 3166 alpha-2 country codes.
  allowedCountriesRaw: z.string().trim().max(500).optional().default(""),
  disclaimer: z.string().trim().max(800).optional().default(""),
});

export async function updateShippingSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();

  const parsed = ShippingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  // Parse country list: tolerant of commas, spaces, or newlines.
  const countries = (parsed.data.allowedCountriesRaw ?? "")
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));

  const adminId = await adminIdFromEmail(user.email);
  await writeSetting(
    "shipping",
    {
      freeThresholdCents: Math.round(parsed.data.freeThresholdEuros * 100),
      flatRateCents: Math.round(parsed.data.flatRateEuros * 100),
      allowedCountries: countries,
      disclaimer: parsed.data.disclaimer ?? "",
    },
    adminId,
  );

  refresh("shipping");
  return OK_SAVED;
}

// ═══════════════════════════════════════════════════════════════════════
// TAX
// ═══════════════════════════════════════════════════════════════════════

const TaxSchema = z.object({
  ratePercent: z.coerce.number().min(0).max(100),
  includedInPrice: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
  // Overrides come in as "NL:21, FR:20" etc.
  overridesRaw: z.string().trim().max(500).optional().default(""),
});

export async function updateTaxSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();

  const parsed = TaxSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const overrides: Record<string, number> = {};
  for (const token of (parsed.data.overridesRaw ?? "").split(/[,\n]+/)) {
    const m = token.trim().match(/^([A-Za-z]{2})\s*[:=]\s*(\d+(?:\.\d+)?)$/);
    if (!m) continue;
    const [, code, pct] = m;
    overrides[code.toUpperCase()] = Number(pct);
  }

  const adminId = await adminIdFromEmail(user.email);
  await writeSetting(
    "tax",
    {
      ratePercent: parsed.data.ratePercent,
      includedInPrice: parsed.data.includedInPrice,
      overrides,
    },
    adminId,
  );

  refresh("tax");
  return OK_SAVED;
}

// ═══════════════════════════════════════════════════════════════════════
// SEO
// ═══════════════════════════════════════════════════════════════════════

const SeoSchema = z.object({
  defaultTitle: z.string().trim().min(1, "A default title is required.").max(180),
  defaultDescription: z
    .string()
    .trim()
    .min(1, "A default meta description is required.")
    .max(400),
  ogImageUrl: z
    .string()
    .trim()
    .url("Use a full https:// URL.")
    .optional()
    .or(z.literal("").transform(() => "")),
  robotsTxt: z.string().trim().max(2000).optional().default(""),
});

export async function updateSeoSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();

  const parsed = SeoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const adminId = await adminIdFromEmail(user.email);
  await writeSetting(
    "seo",
    {
      defaultTitle: parsed.data.defaultTitle,
      defaultDescription: parsed.data.defaultDescription,
      ogImageUrl: parsed.data.ogImageUrl ?? "",
      robotsTxt: parsed.data.robotsTxt ?? "",
    },
    adminId,
  );

  refresh("seo");
  return OK_SAVED;
}

// ═══════════════════════════════════════════════════════════════════════
// AI
// ═══════════════════════════════════════════════════════════════════════

const AiSchema = z.object({
  enabled: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
  assistantName: z.string().trim().min(1, "Give the assistant a name.").max(40),
  systemPrompt: z
    .string()
    .trim()
    .min(50, "The prompt should give the AI enough context (at least 50 characters).")
    .max(8000),
  maxResponseTokens: z.coerce.number().int().min(0).max(4000),
});

export async function updateAiSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();

  const parsed = AiSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const adminId = await adminIdFromEmail(user.email);
  await writeSetting(
    "ai",
    {
      enabled: parsed.data.enabled,
      assistantName: parsed.data.assistantName,
      systemPrompt: parsed.data.systemPrompt,
      maxResponseTokens: parsed.data.maxResponseTokens,
    },
    adminId,
  );

  refresh("ai");
  return OK_SAVED;
}
