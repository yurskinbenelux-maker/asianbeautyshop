// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/testimonials.
//
// Testimonials live in the DB (Testimonial + TestimonialTranslation) and
// feed the homepage "voices" strip. EN is required (it's the fallback for
// every other locale in listActiveTestimonials).
//
// Surface shape:
//   · createTestimonialAction — new row, at least EN translation
//   · updateTestimonialAction — full edit (flags + translations)
//   · deleteTestimonialAction — hard delete (translations cascade)
//   · toggleTestimonialActiveAction — one-click show/hide from the list
//
// After each mutation we revalidate /admin/testimonials AND the public root
// layout — the homepage Testimonials section queries the DB on every
// render, so blowing the layout cache is the cheapest way to reflect the
// change instantly.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

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
  revalidatePath("/admin/testimonials");
  if (id) revalidatePath(`/admin/testimonials/${id}`);
  // Homepage section re-queries on every render; flushing the root layout
  // covers every locale at once without enumerating them here.
  revalidatePath("/", "layout");
}

// ──────── helpers ───────────────────────────────────────────────────────

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

const BaseSchema = z.object({
  // Rating is a 1–5 integer. HTML form sends it as a string.
  rating: z.coerce
    .number()
    .int()
    .min(1, "Rating must be between 1 and 5.")
    .max(5, "Rating must be between 1 and 5."),
  sortOrder: z.coerce.number().int().min(0, "Sort order must be 0 or higher.").max(9999),
  isActive: checkbox,
  verified: checkbox,
});

type Translation = { quote: string; authorName: string; productName: string };

function emptyTranslation(): Translation {
  return { quote: "", authorName: "", productName: "" };
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
      quote: str(formData, `translations.${locale}.quote`),
      authorName: str(formData, `translations.${locale}.authorName`),
      productName: str(formData, `translations.${locale}.productName`),
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
 *   · EN quote + authorName are required (they're the fallback for every
 *     other locale).
 *   · For non-EN: if any field is filled, both quote and authorName must
 *     be — otherwise the card on the homepage would render "author-less"
 *     or "quoteless".
 */
function validateTranslations(
  tr: Record<Locale, Translation>,
): ActionState | null {
  const fieldErrors: ActionState["fieldErrors"] = {};

  if (!tr.EN.quote) {
    fieldErrors["translations.EN.quote"] = [
      "Required — English is the fallback for every visitor.",
    ];
  }
  if (!tr.EN.authorName) {
    fieldErrors["translations.EN.authorName"] = [
      "Required — shown under every translated quote that's missing an author.",
    ];
  }

  for (const locale of ["NL", "FR", "RU"] as Locale[]) {
    const t = tr[locale];
    const hasAny = t.quote || t.authorName || t.productName;
    if (!hasAny) continue;
    if (!t.quote) {
      fieldErrors[`translations.${locale}.quote`] = [
        "Add a quote or clear the other fields for this language.",
      ];
    }
    if (!t.authorName) {
      fieldErrors[`translations.${locale}.authorName`] = [
        "Add an author or clear the other fields for this language.",
      ];
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return bad("Please review the highlighted fields.", fieldErrors);
  }
  return null;
}

// ──────── CREATE ────────────────────────────────────────────────────────

export async function createTestimonialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = BaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;

  const translations = collectTranslations(formData);
  const vErr = validateTranslations(translations);
  if (vErr) return vErr;

  const created = await prisma.testimonial.create({
    data: {
      rating: data.rating,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
      verified: data.verified,
      translations: {
        create: (Object.keys(translations) as Locale[])
          .filter((l) => translations[l].quote.length > 0)
          .map((l) => ({
            locale: l,
            quote: translations[l].quote,
            authorName: translations[l].authorName,
            productName: translations[l].productName || null,
          })),
      },
    },
    select: { id: true },
  });

  refresh(created.id);
  redirect(`/admin/testimonials/${created.id}`);
}

// ──────── UPDATE ────────────────────────────────────────────────────────

export async function updateTestimonialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return bad("Missing testimonial id.");

  const parsed = BaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;

  const translations = collectTranslations(formData);
  const vErr = validateTranslations(translations);
  if (vErr) return vErr;

  const existing = await prisma.testimonial.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return bad("That testimonial no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.testimonial.update({
      where: { id },
      data: {
        rating: data.rating,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
        verified: data.verified,
      },
    });

    for (const locale of ["EN", "NL", "FR", "RU"] as Locale[]) {
      const t = translations[locale];
      if (!t.quote) {
        // No quote = no row for this locale. Drop it if it existed.
        await tx.testimonialTranslation.deleteMany({
          where: { testimonialId: id, locale },
        });
        continue;
      }
      await tx.testimonialTranslation.upsert({
        where: { testimonialId_locale: { testimonialId: id, locale } },
        create: {
          testimonialId: id,
          locale,
          quote: t.quote,
          authorName: t.authorName,
          productName: t.productName || null,
        },
        update: {
          quote: t.quote,
          authorName: t.authorName,
          productName: t.productName || null,
        },
      });
    }
  });

  refresh(id);
  return OK_SAVED;
}

// ──────── DELETE ────────────────────────────────────────────────────────

export async function deleteTestimonialAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Translations cascade via the FK.
  await prisma.testimonial.delete({ where: { id } });
  refresh();
  redirect("/admin/testimonials");
}

// ──────── TOGGLE ACTIVE ─────────────────────────────────────────────────

/**
 * Quick show/hide from the list. No validation needed — this is a single
 * boolean flip on an existing row.
 */
export async function toggleTestimonialActiveAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const row = await prisma.testimonial.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!row) return;
  await prisma.testimonial.update({
    where: { id },
    data: { isActive: !row.isActive },
  });
  refresh(id);
}
