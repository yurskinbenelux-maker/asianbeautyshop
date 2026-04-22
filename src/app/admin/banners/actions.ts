// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/banners.
//
// One banner row = one placement slot on the site (home hero, announcement
// strip, shop top, etc.). We always upsert both the Banner and its
// BannerTranslations in a single transaction so the locale rows never
// drift from the master.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PLACEMENT_IDS } from "./placements";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

function bad(msg: string, fieldErrors?: ActionState["fieldErrors"]): ActionState {
  return { ok: false, message: msg, fieldErrors };
}

function refresh(id?: string) {
  revalidatePath("/admin/banners");
  if (id) revalidatePath(`/admin/banners/${id}`);
  // Homepage pulls banners by placement; revalidate the public tree too.
  revalidatePath("/", "layout");
}

// ──────── schema ────────────────────────────────────────────────────────

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

const optionalDate = z
  .preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.date(),
  )
  .optional();

const BannerSchema = z.object({
  placement: z.enum(PLACEMENT_IDS),
  mediaId: z
    .string()
    .uuid("Pick an image from the media library.")
    .or(z.literal("").transform(() => "")),
  ctaHref: z.string().trim().max(500).optional().default(""),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: checkbox,
  startsAt: optionalDate,
  endsAt: optionalDate,
});

// Keyed per-locale fields come out of FormData as e.g. "translations.EN.headline".
function collectTranslations(
  formData: FormData,
): Record<Locale, { headline: string; subhead: string; ctaLabel: string }> {
  const base: Record<Locale, { headline: string; subhead: string; ctaLabel: string }> = {
    EN: { headline: "", subhead: "", ctaLabel: "" },
    NL: { headline: "", subhead: "", ctaLabel: "" },
    FR: { headline: "", subhead: "", ctaLabel: "" },
    RU: { headline: "", subhead: "", ctaLabel: "" },
  };
  for (const locale of Object.keys(base) as Locale[]) {
    base[locale] = {
      headline: String(formData.get(`translations.${locale}.headline`) ?? "").trim(),
      subhead: String(formData.get(`translations.${locale}.subhead`) ?? "").trim(),
      ctaLabel: String(formData.get(`translations.${locale}.ctaLabel`) ?? "").trim(),
    };
  }
  return base;
}

// ──────── CREATE ────────────────────────────────────────────────────────

export async function createBannerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = BannerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const data = parsed.data;
  const dateError = validateDates(data.startsAt, data.endsAt);
  if (dateError) return bad(dateError, { endsAt: [dateError] });

  // EN headline is required — it's the fallback for every locale on the site.
  const translations = collectTranslations(formData);
  if (!translations.EN.headline) {
    return bad("An English headline is required.", {
      "translations.EN.headline": ["Required."],
    });
  }

  const created = await prisma.banner.create({
    data: {
      placement: data.placement,
      mediaId: data.mediaId || null,
      ctaHref: data.ctaHref || null,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      translations: {
        create: (Object.keys(translations) as Locale[])
          .filter((l) => translations[l].headline.length > 0)
          .map((l) => ({
            locale: l,
            headline: translations[l].headline,
            subhead: translations[l].subhead || null,
            ctaLabel: translations[l].ctaLabel || null,
          })),
      },
    },
    select: { id: true },
  });

  refresh(created.id);
  redirect(`/admin/banners/${created.id}`);
}

// ──────── UPDATE ────────────────────────────────────────────────────────

export async function updateBannerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return bad("Missing banner id.");

  const parsed = BannerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const data = parsed.data;
  const dateError = validateDates(data.startsAt, data.endsAt);
  if (dateError) return bad(dateError, { endsAt: [dateError] });

  const translations = collectTranslations(formData);
  if (!translations.EN.headline) {
    return bad("An English headline is required.", {
      "translations.EN.headline": ["Required."],
    });
  }

  // Upsert translations one-by-one — keeps empty locales clean.
  await prisma.$transaction(async (tx) => {
    await tx.banner.update({
      where: { id },
      data: {
        placement: data.placement,
        mediaId: data.mediaId || null,
        ctaHref: data.ctaHref || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
        startsAt: data.startsAt ?? null,
        endsAt: data.endsAt ?? null,
      },
    });

    for (const locale of Object.keys(translations) as Locale[]) {
      const t = translations[locale];
      if (!t.headline) {
        // Delete the translation row if the admin cleared the headline.
        await tx.bannerTranslation.deleteMany({
          where: { bannerId: id, locale },
        });
        continue;
      }
      await tx.bannerTranslation.upsert({
        where: { bannerId_locale: { bannerId: id, locale } },
        create: {
          bannerId: id,
          locale,
          headline: t.headline,
          subhead: t.subhead || null,
          ctaLabel: t.ctaLabel || null,
        },
        update: {
          headline: t.headline,
          subhead: t.subhead || null,
          ctaLabel: t.ctaLabel || null,
        },
      });
    }
  });

  refresh(id);
  return OK_SAVED;
}

// ──────── QUICK TOGGLE ──────────────────────────────────────────────────

export async function toggleBannerActiveAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const nextActive = formData.get("nextActive") === "true";
  if (!id) return;
  await prisma.banner.update({
    where: { id },
    data: { isActive: nextActive },
  });
  refresh(id);
}

// ──────── DELETE ────────────────────────────────────────────────────────

export async function deleteBannerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.banner.delete({ where: { id } });
  refresh();
  redirect("/admin/banners");
}

// ──────── helpers ───────────────────────────────────────────────────────

function validateDates(
  startsAt: Date | undefined,
  endsAt: Date | undefined,
): string | null {
  if (!startsAt || !endsAt) return null;
  if (endsAt.getTime() <= startsAt.getTime()) {
    return "End date must be after the start date.";
  }
  return null;
}
