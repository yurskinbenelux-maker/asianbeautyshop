// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/hero-popup actions.
//
//   saveHeroPopupAction       — full-form save, redirects with ?saved=1
//   translateHeroPopupAction  — DeepL: fan one EN field into NL/FR/RU
//   polishHeroPopupAction     — Groq: rewrite one EN field for tone polish
//
// Storage shape lives in src/lib/queries/hero-popup.ts. Field validation
// is via Zod with generous max lengths (eyebrow 80, headline 160, etc.) —
// the public popup truncates with ellipsis if an admin goes wild, but the
// schema accepts it.
//
// All actions require the `homepage.edit` capability so only the
// owner/editor roles can change the popup. (Same capability used by
// welcome-popup + quiz-popup.)
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Locale } from "@prisma/client";

import { requireCapability } from "@/lib/auth-roles";
import { translateBatch } from "@/lib/translate/deepl";
import { polishEmailText } from "@/lib/ai/polish-email-text";
import {
  HERO_POPUP_FIELDS,
  readHeroPopupSettings,
  writeHeroPopupSettings,
  type HeroPopupCopy,
  type HeroPopupSettings,
  type ProductCropMap,
} from "@/lib/queries/hero-popup";

export type HeroPopupActionState = {
  ok: boolean;
  message?: string;
};

const FIELD_KEYS = HERO_POPUP_FIELDS.map((f) => f.key) as Array<
  keyof HeroPopupCopy
>;

// ────────── full save ───────────────────────────────────────────────────

const CopyShape = z.object({
  eyebrow: z.string().trim().max(120).optional().default(""),
  headline: z.string().trim().max(200).optional().default(""),
  lede: z.string().trim().max(400).optional().default(""),
  skipLabel: z.string().trim().max(60).optional().default(""),
  hintLabel: z.string().trim().max(60).optional().default(""),
});

const SaveSchema = z.object({
  enabled: z
    .union([z.string(), z.undefined()])
    .transform((v) => v !== undefined),
  delaySeconds: z.coerce.number().int().min(0).max(60),
  // Comma-separated UUIDs — the form serialises the drag-to-reorder
  // list into a single hidden input rather than N hidden inputs, which
  // keeps the FormData parse trivial.
  productIdsCsv: z.string().trim().max(1000).optional().default(""),
  // Per-locale copy is flattened to fields like "EN.eyebrow",
  // "NL.headline" so we can read it from FormData with a simple loop.
});

function parseCopyFromForm(formData: FormData, locale: Locale): HeroPopupCopy {
  const raw: Record<string, string> = {};
  for (const k of FIELD_KEYS) {
    raw[k] = String(formData.get(`${locale}.${k}`) ?? "");
  }
  const parsed = CopyShape.parse(raw);
  return {
    eyebrow: parsed.eyebrow,
    headline: parsed.headline,
    lede: parsed.lede,
    skipLabel: parsed.skipLabel,
    hintLabel: parsed.hintLabel,
  };
}

export async function saveHeroPopupAction(formData: FormData): Promise<void> {
  await requireCapability("homepage.edit", "/admin");

  const top = SaveSchema.parse({
    enabled: formData.get("enabled") ?? undefined,
    delaySeconds: formData.get("delaySeconds") ?? "3",
    productIdsCsv: formData.get("productIdsCsv") ?? "",
  });

  // Comma-split, trim, drop blanks, dedupe (simple Set), cap at 6.
  const ids = Array.from(
    new Set(
      top.productIdsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, 6);

  // Crops live as N pairs of FormData fields named
  //   crop.${id}.desktop, crop.${id}.mobile
  // The admin form renders these as hidden inputs from its
  // controlled state. We collect them by walking the saved id list
  // (ignoring anything for ids that weren't actually picked) and
  // capping each value at 60 chars (same as the read side).
  const productCrops: ProductCropMap = {};
  for (const id of ids) {
    const desktop = String(formData.get(`crop.${id}.desktop`) ?? "")
      .trim()
      .slice(0, 60);
    const mobile = String(formData.get(`crop.${id}.mobile`) ?? "")
      .trim()
      .slice(0, 60);
    if (!desktop && !mobile) continue;
    productCrops[id] = { desktop, mobile };
  }

  const next: HeroPopupSettings = {
    enabled: top.enabled,
    delaySeconds: top.delaySeconds,
    productIds: ids,
    productCrops,
    copy: {
      [Locale.EN]: parseCopyFromForm(formData, Locale.EN),
      [Locale.NL]: parseCopyFromForm(formData, Locale.NL),
      [Locale.FR]: parseCopyFromForm(formData, Locale.FR),
      [Locale.RU]: parseCopyFromForm(formData, Locale.RU),
    },
  };

  await writeHeroPopupSettings(next);

  // Public layout caches the popup config — bust it so an admin sees her
  // change without a hard refresh.
  revalidatePath("/", "layout");
  redirect("/admin/marketing/hero-popup?saved=1");
}

// ────────── DeepL translate one EN field → NL/FR/RU ─────────────────────

type TranslateState = HeroPopupActionState & {
  translations?: Partial<Record<Locale, string>>;
};

const TranslateSchema = z.object({
  fieldKey: z.string().min(1),
  value: z.string().min(1).max(400),
});

export async function translateHeroPopupAction(
  _prev: TranslateState,
  formData: FormData,
): Promise<TranslateState> {
  await requireCapability("homepage.edit", "/admin");
  const parsed = TranslateSchema.safeParse({
    fieldKey: formData.get("fieldKey"),
    value: formData.get("value") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Nothing to translate." };
  }
  if (!FIELD_KEYS.includes(parsed.data.fieldKey as keyof HeroPopupCopy)) {
    return { ok: false, message: "Unknown field." };
  }

  const targets: Locale[] = [Locale.NL, Locale.FR, Locale.RU];
  try {
    const results = await Promise.all(
      targets.map(async (target) => {
        const out = await translateBatch([parsed.data.value], { target });
        if (!out.ok) {
          throw new Error(`DeepL ${out.error.kind}`);
        }
        return { target, value: (out.translations[0] ?? "").trim() };
      }),
    );

    // Persist each translation into the saved settings so an admin sees
    // them on next page load AND if she navigates away. Read-modify-
    // write — admin traffic is low enough that the race is fine.
    const current = await readHeroPopupSettings();
    const fieldKey = parsed.data.fieldKey as keyof HeroPopupCopy;
    const next: HeroPopupSettings = {
      ...current,
      copy: { ...current.copy },
    };
    const translations: Partial<Record<Locale, string>> = {};
    for (const r of results) {
      if (!r.value) continue;
      next.copy[r.target] = { ...next.copy[r.target], [fieldKey]: r.value };
      translations[r.target] = r.value;
    }
    await writeHeroPopupSettings(next);
    revalidatePath("/admin/marketing/hero-popup");

    return {
      ok: true,
      message: "Translated to NL, FR, RU.",
      translations,
    };
  } catch (err) {
    console.error("[hero-popup] DeepL translate failed", err);
    return {
      ok: false,
      message: "DeepL rejected the request — check DEEPL_API_KEY.",
    };
  }
}

// ────────── Groq polish one EN field ────────────────────────────────────

type PolishState = HeroPopupActionState & {
  polishedValue?: string;
};

const PolishSchema = z.object({
  fieldKey: z.string().min(1),
  value: z.string().min(1).max(400),
});

const FIELD_LABELS: Record<keyof HeroPopupCopy, string> = {
  eyebrow: "Hero popup eyebrow tag (uppercase, ≤4 words)",
  headline: "Hero popup headline (serif, ≤6 words, sentence case)",
  lede: "Hero popup lede (one short sentence, warm and editorial)",
  skipLabel: "Hero popup skip link (2-3 words, gentle)",
  hintLabel: "Hero popup interaction hint (3-4 words, ends with arrow)",
};

export async function polishHeroPopupAction(
  _prev: PolishState,
  formData: FormData,
): Promise<PolishState> {
  await requireCapability("homepage.edit", "/admin");
  const parsed = PolishSchema.safeParse({
    fieldKey: formData.get("fieldKey"),
    value: formData.get("value") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Nothing to polish." };
  }
  const fieldKey = parsed.data.fieldKey as keyof HeroPopupCopy;
  if (!FIELD_KEYS.includes(fieldKey)) {
    return { ok: false, message: "Unknown field." };
  }

  try {
    const polished = await polishEmailText({
      locale: Locale.EN,
      fieldLabel: FIELD_LABELS[fieldKey],
      current: parsed.data.value,
    });
    if (!polished || !polished.trim()) {
      return { ok: false, message: "Groq returned an empty result." };
    }

    // Save the polished value into the EN tab so the change persists
    // across reloads and DeepL can fan it out next.
    const current = await readHeroPopupSettings();
    const next: HeroPopupSettings = {
      ...current,
      copy: {
        ...current.copy,
        [Locale.EN]: { ...current.copy[Locale.EN], [fieldKey]: polished },
      },
    };
    await writeHeroPopupSettings(next);
    revalidatePath("/admin/marketing/hero-popup");

    return { ok: true, message: "Polished.", polishedValue: polished };
  } catch (err) {
    console.error("[hero-popup] Groq polish failed", err);
    return {
      ok: false,
      message: "Groq rejected the request — check GROQ_API_KEY.",
    };
  }
}
