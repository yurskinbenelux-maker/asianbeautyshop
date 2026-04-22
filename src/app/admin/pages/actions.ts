// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/pages.
//
// Static pages: about, faq, shipping, legal (privacy/terms/...). Each row
// has a stable `key` (used in URLs) and per-locale title/body/SEO.
//
// EN is required. The public site falls back to EN when the requested
// locale is missing.
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

function refresh(key?: string) {
  revalidatePath("/admin/pages");
  if (key) revalidatePath(`/admin/pages/${key}`);
  // Legal pages are rendered at /[locale]/legal/[key]; blow away the root.
  revalidatePath("/", "layout");
}

// ──────── helpers ───────────────────────────────────────────────────────

const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

const CreateSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2, "Choose a key of at least 2 characters.")
    .max(40, "Keep the key short — under 40 characters.")
    .regex(KEY_RE, "Lowercase letters, numbers, and hyphens only.")
    .transform((v) => v.toLowerCase()),
  isActive: checkbox,
});

const UpdateSchema = z.object({
  isActive: checkbox,
});

function collectTranslations(formData: FormData): Record<
  Locale,
  { title: string; body: string; seoTitle: string; seoDescription: string }
> {
  const base = {
    EN: empty(),
    NL: empty(),
    FR: empty(),
    RU: empty(),
  } satisfies Record<
    Locale,
    { title: string; body: string; seoTitle: string; seoDescription: string }
  >;
  for (const locale of Object.keys(base) as Locale[]) {
    base[locale] = {
      title: str(formData, `translations.${locale}.title`),
      body: str(formData, `translations.${locale}.body`),
      seoTitle: str(formData, `translations.${locale}.seoTitle`),
      seoDescription: str(formData, `translations.${locale}.seoDescription`),
    };
  }
  return base;
}

function empty() {
  return { title: "", body: "", seoTitle: "", seoDescription: "" };
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return v == null ? "" : String(v).trim();
}

function validateTranslations(
  translations: ReturnType<typeof collectTranslations>,
): ActionState | null {
  const fieldErrors: ActionState["fieldErrors"] = {};
  if (!translations.EN.title) {
    fieldErrors["translations.EN.title"] = ["Required — this is the fallback."];
  }
  if (!translations.EN.body) {
    fieldErrors["translations.EN.body"] = ["Required — add at least one paragraph."];
  }
  // If a non-EN locale has a body but no title, flag it.
  for (const locale of ["NL", "FR", "RU"] as Locale[]) {
    const t = translations[locale];
    if ((t.body || t.seoTitle || t.seoDescription) && !t.title) {
      fieldErrors[`translations.${locale}.title`] = [
        "Add a title or clear the other fields for this language.",
      ];
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return bad("Please review the highlighted fields.", fieldErrors);
  }
  return null;
}

// ──────── CREATE ────────────────────────────────────────────────────────

export async function createPageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;

  const existing = await prisma.page.findUnique({
    where: { key: data.key },
    select: { id: true },
  });
  if (existing) {
    return bad("A page with this key already exists.", {
      key: ["Already taken — pick a different key."],
    });
  }

  const translations = collectTranslations(formData);
  const vErr = validateTranslations(translations);
  if (vErr) return vErr;

  const created = await prisma.page.create({
    data: {
      key: data.key,
      isActive: data.isActive,
      translations: {
        create: (Object.keys(translations) as Locale[])
          .filter((l) => translations[l].title.length > 0)
          .map((l) => ({
            locale: l,
            title: translations[l].title,
            body: translations[l].body,
            seoTitle: translations[l].seoTitle || null,
            seoDescription: translations[l].seoDescription || null,
          })),
      },
    },
    select: { key: true },
  });

  refresh(created.key);
  redirect(`/admin/pages/${created.key}`);
}

// ──────── UPDATE ────────────────────────────────────────────────────────

export async function updatePageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const key = String(formData.get("key") ?? "");
  if (!key) return bad("Missing page key.");

  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData));
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

  const page = await prisma.page.findUnique({
    where: { key },
    select: { id: true },
  });
  if (!page) return bad("That page no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.page.update({
      where: { id: page.id },
      data: { isActive: data.isActive },
    });

    for (const locale of ["EN", "NL", "FR", "RU"] as Locale[]) {
      const t = translations[locale];
      if (!t.title) {
        await tx.pageTranslation.deleteMany({
          where: { pageId: page.id, locale },
        });
        continue;
      }
      await tx.pageTranslation.upsert({
        where: { pageId_locale: { pageId: page.id, locale } },
        create: {
          pageId: page.id,
          locale,
          title: t.title,
          body: t.body,
          seoTitle: t.seoTitle || null,
          seoDescription: t.seoDescription || null,
        },
        update: {
          title: t.title,
          body: t.body,
          seoTitle: t.seoTitle || null,
          seoDescription: t.seoDescription || null,
        },
      });
    }
  });

  refresh(key);
  return OK_SAVED;
}

// ──────── DELETE ────────────────────────────────────────────────────────

export async function deletePageAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("key") ?? "");
  if (!key) return;
  await prisma.page.delete({ where: { key } });
  refresh();
  redirect("/admin/pages");
}
