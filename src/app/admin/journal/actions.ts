// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/journal.
//
// One row = one journal post. Master fields (status, publishedAt, cover
// image, author name) live on JournalPost; per-language copy lives on
// JournalPostTranslation. EN title+slug are required; the others fall
// back to EN on the public site.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Locale, PostStatus } from "@prisma/client";
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
  revalidatePath("/admin/journal");
  if (id) revalidatePath(`/admin/journal/${id}`);
  // Public journal list + individual post pages.
  revalidatePath("/", "layout");
}

// ──────── slug hygiene ──────────────────────────────────────────────────
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function normaliseSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ──────── schema ────────────────────────────────────────────────────────

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

const optionalDateTime = z
  .preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.date(),
  )
  .optional();

const PostSchema = z.object({
  status: z.nativeEnum(PostStatus),
  publishedAt: optionalDateTime,
  coverUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .default(""),
  authorName: z.string().trim().max(120).optional().default(""),
});

function collectTranslations(formData: FormData): Record<
  Locale,
  {
    title: string;
    slug: string;
    excerpt: string;
    body: string;
    seoTitle: string;
    seoDescription: string;
  }
> {
  const base = {
    EN: empty(),
    NL: empty(),
    FR: empty(),
    RU: empty(),
  } satisfies Record<
    Locale,
    {
      title: string;
      slug: string;
      excerpt: string;
      body: string;
      seoTitle: string;
      seoDescription: string;
    }
  >;
  for (const locale of Object.keys(base) as Locale[]) {
    base[locale] = {
      title: str(formData, `translations.${locale}.title`),
      slug: str(formData, `translations.${locale}.slug`),
      excerpt: str(formData, `translations.${locale}.excerpt`),
      body: str(formData, `translations.${locale}.body`),
      seoTitle: str(formData, `translations.${locale}.seoTitle`),
      seoDescription: str(formData, `translations.${locale}.seoDescription`),
    };
  }
  return base;
}

function empty() {
  return {
    title: "",
    slug: "",
    excerpt: "",
    body: "",
    seoTitle: "",
    seoDescription: "",
  };
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return v == null ? "" : String(v).trim();
}

// Validate EN (required) and check slug regex for any locale that has a title.
function validateTranslations(
  translations: ReturnType<typeof collectTranslations>,
): {
  error?: string;
  fieldErrors?: ActionState["fieldErrors"];
  normalised: ReturnType<typeof collectTranslations>;
} {
  const fieldErrors: ActionState["fieldErrors"] = {};
  const norm = { ...translations } as ReturnType<typeof collectTranslations>;

  if (!norm.EN.title) {
    fieldErrors["translations.EN.title"] = ["Required — the English title is the fallback."];
  }

  for (const locale of ["EN", "NL", "FR", "RU"] as Locale[]) {
    const t = norm[locale];
    // If the locale has a title, slug is required for that locale.
    if (t.title) {
      const candidate = t.slug ? t.slug : normaliseSlug(t.title);
      const slug = normaliseSlug(candidate);
      if (!slug || !SLUG_RE.test(slug)) {
        fieldErrors[`translations.${locale}.slug`] = [
          "Must be lowercase letters, numbers, and hyphens.",
        ];
      } else {
        norm[locale] = { ...t, slug };
      }
    } else if (t.slug || t.body || t.excerpt) {
      // If there's body/excerpt/slug but no title, flag the title.
      fieldErrors[`translations.${locale}.title`] = [
        "Add a title or clear the other fields for this language.",
      ];
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "Please review the highlighted fields.",
      fieldErrors,
      normalised: norm,
    };
  }
  return { normalised: norm };
}

// ──────── CREATE ────────────────────────────────────────────────────────

export async function createJournalPostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = PostSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;

  const translations = collectTranslations(formData);
  const { error, fieldErrors, normalised } = validateTranslations(translations);
  if (error) return bad(error, fieldErrors);

  // Slug uniqueness check per-locale.
  const slugCheckError = await ensureSlugsFree(normalised, null);
  if (slugCheckError) return slugCheckError;

  const created = await prisma.journalPost.create({
    data: {
      status: data.status,
      publishedAt: publishedAtFor(data.status, data.publishedAt),
      coverUrl: data.coverUrl || null,
      authorName: data.authorName || null,
      translations: {
        create: (Object.keys(normalised) as Locale[])
          .filter((l) => normalised[l].title.length > 0)
          .map((l) => ({
            locale: l,
            title: normalised[l].title,
            slug: normalised[l].slug,
            excerpt: normalised[l].excerpt || null,
            body: normalised[l].body,
            seoTitle: normalised[l].seoTitle || null,
            seoDescription: normalised[l].seoDescription || null,
          })),
      },
    },
    select: { id: true },
  });

  refresh(created.id);
  redirect(`/admin/journal/${created.id}`);
}

// ──────── UPDATE ────────────────────────────────────────────────────────

export async function updateJournalPostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return bad("Missing post id.");

  const parsed = PostSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return bad(
      "Please review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;

  const translations = collectTranslations(formData);
  const { error, fieldErrors, normalised } = validateTranslations(translations);
  if (error) return bad(error, fieldErrors);

  const slugCheckError = await ensureSlugsFree(normalised, id);
  if (slugCheckError) return slugCheckError;

  await prisma.$transaction(async (tx) => {
    await tx.journalPost.update({
      where: { id },
      data: {
        status: data.status,
        publishedAt: publishedAtFor(data.status, data.publishedAt),
        coverUrl: data.coverUrl || null,
        authorName: data.authorName || null,
      },
    });

    for (const locale of ["EN", "NL", "FR", "RU"] as Locale[]) {
      const t = normalised[locale];
      if (!t.title) {
        await tx.journalPostTranslation.deleteMany({
          where: { postId: id, locale },
        });
        continue;
      }
      await tx.journalPostTranslation.upsert({
        where: { postId_locale: { postId: id, locale } },
        create: {
          postId: id,
          locale,
          title: t.title,
          slug: t.slug,
          excerpt: t.excerpt || null,
          body: t.body,
          seoTitle: t.seoTitle || null,
          seoDescription: t.seoDescription || null,
        },
        update: {
          title: t.title,
          slug: t.slug,
          excerpt: t.excerpt || null,
          body: t.body,
          seoTitle: t.seoTitle || null,
          seoDescription: t.seoDescription || null,
        },
      });
    }
  });

  refresh(id);
  return OK_SAVED;
}

// ──────── DELETE ────────────────────────────────────────────────────────

export async function deleteJournalPostAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.journalPost.delete({ where: { id } });
  refresh();
  redirect("/admin/journal");
}

// ──────── helpers ───────────────────────────────────────────────────────

/**
 * If status is SCHEDULED, publishedAt must be in the future.
 * If status is PUBLISHED, default publishedAt to now if blank.
 * If status is DRAFT, clear publishedAt.
 */
function publishedAtFor(
  status: PostStatus,
  raw: Date | undefined,
): Date | null {
  if (status === "DRAFT") return null;
  if (status === "PUBLISHED") return raw ?? new Date();
  // SCHEDULED — only keep it if it's actually in the future; otherwise null
  // and treat as draft until the admin picks a date.
  if (status === "SCHEDULED" && raw && raw.getTime() > Date.now()) return raw;
  return raw ?? null;
}

async function ensureSlugsFree(
  translations: ReturnType<typeof collectTranslations>,
  excludePostId: string | null,
): Promise<ActionState | null> {
  const fieldErrors: ActionState["fieldErrors"] = {};
  for (const locale of ["EN", "NL", "FR", "RU"] as Locale[]) {
    const t = translations[locale];
    if (!t.title || !t.slug) continue;
    const clash = await prisma.journalPostTranslation.findFirst({
      where: {
        locale,
        slug: t.slug,
        ...(excludePostId ? { postId: { not: excludePostId } } : {}),
      },
      select: { postId: true },
    });
    if (clash) {
      fieldErrors[`translations.${locale}.slug`] = [
        `This slug is already used by another ${locale} post.`,
      ];
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return bad("Please review the highlighted fields.", fieldErrors);
  }
  return null;
}
