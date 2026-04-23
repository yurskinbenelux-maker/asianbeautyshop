// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/ingredients.
//
// Surface:
//   · createIngredientAction    — new row + EN translation (required)
//   · updateIngredientAction    — full edit (slug, flags, all 4 locales)
//   · deleteIngredientAction    — hard delete (translations + product
//                                 links cascade via FK onDelete: Cascade)
//   · toggleIngredientFlagAction — one-click key-asset / allergen flip
//
// Every mutation revalidates the admin list + the public /ingredients
// index + PDP (ingredients surface in the PDP ingredient block).
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";
import { isSlugTaken } from "@/lib/queries/admin-ingredients";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

function bad(
  msg: string,
  fieldErrors?: ActionState["fieldErrors"],
): ActionState {
  return { ok: false, message: msg, fieldErrors };
}

function refresh(id?: string) {
  revalidatePath("/admin/ingredients");
  if (id) revalidatePath(`/admin/ingredients/${id}`);
  // Public index + any PDP — ingredients appear on product pages.
  revalidatePath("/", "layout");
}

// ──────── helpers ───────────────────────────────────────────────────────

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

/**
 * Slugs: lowercase letters, digits, hyphens. Max 80 chars so the URL
 * stays legible. Leading / trailing hyphens rejected.
 */
const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const BaseSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, "Slug is too short.")
    .max(80, "Slug is too long.")
    .regex(SLUG_RX, "Use lowercase letters, numbers, and single hyphens."),
  inciName: z
    .string()
    .trim()
    .min(2, "INCI name is required.")
    .max(160, "INCI name is too long."),
  isKeyAsset: checkbox,
  isAllergen: checkbox,
});

type Translation = { displayName: string; description: string };

function emptyTranslation(): Translation {
  return { displayName: "", description: "" };
}

function collectTranslations(
  formData: FormData,
): Record<Locale, Translation> {
  const base: Record<Locale, Translation> = {
    EN: emptyTranslation(),
    NL: emptyTranslation(),
    FR: emptyTranslation(),
    RU: emptyTranslation(),
  };
  for (const locale of Object.keys(base) as Locale[]) {
    base[locale] = {
      displayName: str(formData, `translations.${locale}.displayName`),
      description: str(formData, `translations.${locale}.description`),
    };
  }
  return base;
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return v == null ? "" : String(v).trim();
}

/**
 * Rules:
 *   · EN displayName required (fallback for every other locale).
 *   · Other locales: if displayName is empty we skip the whole row, even
 *     if a description is present — we don't want orphan descriptions.
 */
function validateTranslations(
  tr: Record<Locale, Translation>,
): ActionState | null {
  const fieldErrors: ActionState["fieldErrors"] = {};

  if (!tr.EN.displayName) {
    fieldErrors["translations.EN.displayName"] = [
      "Required — English is the fallback for every visitor.",
    ];
  }

  for (const locale of ["NL", "FR", "RU"] as Locale[]) {
    const t = tr[locale];
    if (!t.displayName && t.description) {
      fieldErrors[`translations.${locale}.displayName`] = [
        "Add a display name, or clear the description for this language.",
      ];
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return bad("Please review the highlighted fields.", fieldErrors);
  }
  return null;
}

// ──────── CREATE ────────────────────────────────────────────────────────

export async function createIngredientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCapability("ingredients.edit");

  const parsed = BaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;

  if (await isSlugTaken(data.slug)) {
    return bad("Please review the highlighted fields.", {
      slug: ["That slug is already in use."],
    });
  }

  const translations = collectTranslations(formData);
  const vErr = validateTranslations(translations);
  if (vErr) return vErr;

  const created = await prisma.ingredient.create({
    data: {
      slug: data.slug,
      inciName: data.inciName,
      isKeyAsset: data.isKeyAsset,
      isAllergen: data.isAllergen,
      translations: {
        create: (Object.keys(translations) as Locale[])
          .filter((l) => translations[l].displayName.length > 0)
          .map((l) => ({
            locale: l,
            displayName: translations[l].displayName,
            description: translations[l].description || null,
          })),
      },
    },
    select: { id: true },
  });

  refresh(created.id);
  redirect(`/admin/ingredients/${created.id}`);
}

// ──────── UPDATE ────────────────────────────────────────────────────────

export async function updateIngredientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCapability("ingredients.edit");

  const id = String(formData.get("id") ?? "");
  if (!id) return bad("Missing ingredient id.");

  const parsed = BaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;

  if (await isSlugTaken(data.slug, id)) {
    return bad("Please review the highlighted fields.", {
      slug: ["That slug is already in use by another ingredient."],
    });
  }

  const translations = collectTranslations(formData);
  const vErr = validateTranslations(translations);
  if (vErr) return vErr;

  const existing = await prisma.ingredient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return bad("That ingredient no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.ingredient.update({
      where: { id },
      data: {
        slug: data.slug,
        inciName: data.inciName,
        isKeyAsset: data.isKeyAsset,
        isAllergen: data.isAllergen,
      },
    });

    for (const locale of ["EN", "NL", "FR", "RU"] as Locale[]) {
      const t = translations[locale];
      if (!t.displayName) {
        // No display name = no row for this locale. Drop it if it existed.
        await tx.ingredientTranslation.deleteMany({
          where: { ingredientId: id, locale },
        });
        continue;
      }
      await tx.ingredientTranslation.upsert({
        where: { ingredientId_locale: { ingredientId: id, locale } },
        create: {
          ingredientId: id,
          locale,
          displayName: t.displayName,
          description: t.description || null,
        },
        update: {
          displayName: t.displayName,
          description: t.description || null,
        },
      });
    }
  });

  refresh(id);
  return OK_SAVED;
}

// ──────── DELETE ────────────────────────────────────────────────────────

export async function deleteIngredientAction(
  formData: FormData,
): Promise<void> {
  await requireCapability("ingredients.edit");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Translations + ProductIngredient rows cascade via their FKs.
  await prisma.ingredient.delete({ where: { id } });
  refresh();
  redirect("/admin/ingredients");
}

// ──────── TOGGLE FLAGS ──────────────────────────────────────────────────

export async function toggleIngredientFlagAction(
  formData: FormData,
): Promise<void> {
  await requireCapability("ingredients.edit");
  const id = String(formData.get("id") ?? "");
  const flag = String(formData.get("flag") ?? "");
  if (!id || (flag !== "isKeyAsset" && flag !== "isAllergen")) return;

  const row = await prisma.ingredient.findUnique({
    where: { id },
    select: { isKeyAsset: true, isAllergen: true },
  });
  if (!row) return;

  await prisma.ingredient.update({
    where: { id },
    data: { [flag]: !row[flag as keyof typeof row] },
  });
  refresh(id);
}
