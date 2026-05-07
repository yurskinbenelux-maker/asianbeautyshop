// ─────────────────────────────────────────────────────────────────────────
// Server actions for /admin/categories — Category + Brand + Ingredient +
// simple taxonomies (Concern, SkinType, Benefit). All shop-organisational
// writes live here so one revalidation strategy can cover the lot:
//
//    revalidatePath("/", "layout")  -> public site (shop, homepage)
//    revalidatePath("/admin/categories", "layout")
//
// Every action calls requireAdmin() first — defence in depth on top of
// the layout guard.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Locale, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_MEDIA_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { ALL_LOCALES } from "@/lib/queries/admin-taxonomies";
import { upsertAutoRedirect } from "@/lib/redirects/db";

// Locales that need a redirect row per slug change — category + brand
// slugs are NOT translated per locale, so the same rename affects all 4.
const LOCALE_SEGMENTS = ["en", "nl", "fr", "ru"] as const;

async function fanOutSlugRedirect(
  base: "shop/category" | "shop/brand",
  oldSlug: string,
  newSlug: string,
  source: string,
) {
  if (!oldSlug || oldSlug === newSlug) return;
  await Promise.all(
    LOCALE_SEGMENTS.map((loc) =>
      upsertAutoRedirect({
        fromPath: `/${loc}/${base}/${oldSlug}`,
        toPath: `/${loc}/${base}/${newSlug}`,
        source,
      }).catch(() => {
        /* fire-and-forget, never block the save */
      }),
    ),
  );
}

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

// ──────── helpers ────────────────────────────────────────────────────────

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function bumpSlug(slug: string, taken: Set<string>): string {
  if (!taken.has(slug)) return slug;
  let i = 2;
  while (taken.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}

function refresh() {
  revalidatePath("/admin/categories", "layout");
  revalidatePath("/", "layout");
}

// Zod helpers for locale-keyed form fields like `translations.EN.name`.
const LocaleEnum = z.nativeEnum(Locale);
type LocaleMap<T> = Partial<Record<Locale, T>>;

function readLocaleField(
  form: FormData,
  bucket: string,
  key: string,
): LocaleMap<string> {
  const out: LocaleMap<string> = {};
  for (const l of ALL_LOCALES) {
    const raw = form.get(`${bucket}.${l}.${key}`);
    if (raw !== null) out[l] = String(raw).trim();
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// CATEGORY
// ═══════════════════════════════════════════════════════════════════════

const CategoryBasicSchema = z.object({
  slug: z.string().trim().max(80).optional(),
  parentId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
  iconUrl: z.string().url().optional().or(z.literal("").transform(() => undefined)),
});

export async function createCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const enName = String(formData.get("translations.EN.name") ?? "").trim();
  if (!enName) {
    return {
      ok: false,
      message: "An English name is required.",
      fieldErrors: { "translations.EN.name": ["English name is required."] },
    };
  }

  const basic = CategoryBasicSchema.safeParse(Object.fromEntries(formData));
  if (!basic.success) {
    return {
      ok: false,
      message: "Please review the highlighted fields.",
      fieldErrors: basic.error.flatten().fieldErrors,
    };
  }

  const names = readLocaleField(formData, "translations", "name");
  const descs = readLocaleField(formData, "translations", "description");
  const seoTitles = readLocaleField(formData, "translations", "seoTitle");
  const seoDescs = readLocaleField(formData, "translations", "seoDescription");

  // Auto-slug from the English name if an admin left it blank.
  const desiredSlug = slugify(basic.data.slug || enName);
  const taken = new Set(
    (await prisma.category.findMany({ select: { slug: true } })).map((c) => c.slug),
  );
  const slug = bumpSlug(desiredSlug || "category", taken);

  const created = await prisma.category.create({
    data: {
      slug,
      parentId: basic.data.parentId,
      sortOrder: basic.data.sortOrder,
      isActive: basic.data.isActive,
      iconUrl: basic.data.iconUrl ?? null,
      translations: {
        create: ALL_LOCALES.filter((l) => (names[l] ?? "").length > 0).map(
          (l) => ({
            locale: l,
            name: names[l]!,
            description: descs[l] || null,
            seoTitle: seoTitles[l] || null,
            seoDescription: seoDescs[l] || null,
          }),
        ),
      },
    },
  });

  refresh();
  redirect(`/admin/categories/${created.id}?saved=1`);
}

export async function updateCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing category id." };

  const enName = String(formData.get("translations.EN.name") ?? "").trim();
  if (!enName) {
    return {
      ok: false,
      message: "An English name is required.",
      fieldErrors: { "translations.EN.name": ["English name is required."] },
    };
  }

  const basic = CategoryBasicSchema.safeParse(Object.fromEntries(formData));
  if (!basic.success) {
    return {
      ok: false,
      message: "Please review the highlighted fields.",
      fieldErrors: basic.error.flatten().fieldErrors,
    };
  }

  // Reject self-parenting (also enforced by the query options, belt+braces).
  if (basic.data.parentId === id) {
    return {
      ok: false,
      message: "A category cannot be its own parent.",
      fieldErrors: { parentId: ["Choose a different parent."] },
    };
  }

  const names = readLocaleField(formData, "translations", "name");
  const descs = readLocaleField(formData, "translations", "description");
  const seoTitles = readLocaleField(formData, "translations", "seoTitle");
  const seoDescs = readLocaleField(formData, "translations", "seoDescription");

  // Capture the old slug first so we can fan out a redirect after the update.
  const existing = await prisma.category.findUnique({
    where: { id },
    select: { slug: true },
  });

  // Slug: only change if admin explicitly typed one different from the existing.
  let slug: string | undefined;
  if (basic.data.slug && existing) {
    const desired = slugify(basic.data.slug);
    if (desired !== existing.slug) {
      const taken = new Set(
        (await prisma.category.findMany({
          where: { NOT: { id } },
          select: { slug: true },
        })).map((c) => c.slug),
      );
      slug = bumpSlug(desired || "category", taken);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.category.update({
      where: { id },
      data: {
        ...(slug ? { slug } : {}),
        parentId: basic.data.parentId ?? null,
        sortOrder: basic.data.sortOrder,
        isActive: basic.data.isActive,
        iconUrl: basic.data.iconUrl ?? null,
      },
    });

    // Upsert each locale row; delete rows the admin cleared completely.
    for (const l of ALL_LOCALES) {
      const name = names[l] ?? "";
      if (name.length === 0) {
        if (l !== Locale.EN) {
          await tx.categoryTranslation.deleteMany({
            where: { categoryId: id, locale: l },
          });
        }
        continue;
      }
      await tx.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: id, locale: l } },
        create: {
          categoryId: id,
          locale: l,
          name,
          description: descs[l] || null,
          seoTitle: seoTitles[l] || null,
          seoDescription: seoDescs[l] || null,
        },
        update: {
          name,
          description: descs[l] || null,
          seoTitle: seoTitles[l] || null,
          seoDescription: seoDescs[l] || null,
        },
      });
    }
  });

  // Slug changed: fan out `/{locale}/shop/category/{old}` -> new, across all
  // 4 locales. Category slug is global (not translated).
  if (slug && existing && existing.slug !== slug) {
    await fanOutSlugRedirect(
      "shop/category",
      existing.slug,
      slug,
      "auto:category-slug",
    );
  }

  refresh();
  return OK_SAVED;
}

export async function deleteCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!id) return { ok: false, message: "Missing id." };
  if (confirm !== "DELETE") {
    return {
      ok: false,
      message: "Type DELETE to confirm.",
      fieldErrors: { confirm: ["Type DELETE to confirm."] },
    };
  }

  // Deletion cascades to ProductCategory + CategoryTranslation (onDelete: Cascade).
  // Children are re-parented to root to avoid orphan references.
  await prisma.$transaction(async (tx) => {
    await tx.category.updateMany({
      where: { parentId: id },
      data: { parentId: null },
    });
    await tx.category.delete({ where: { id } });
  });

  refresh();
  redirect("/admin/categories?deleted=1");
}

export async function uploadCategoryIconAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing category id." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No file selected." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, message: "File too large (max 2 MB for icons)." };
  }
  if (!["image/png", "image/webp", "image/svg+xml", "image/jpeg"].includes(file.type)) {
    return { ok: false, message: "Use PNG, WEBP, SVG, or JPG." };
  }

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const objectPath = `categories/${id}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabaseAdmin()
    .storage.from(PRODUCT_MEDIA_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      cacheControl: "31536000, immutable",
      upsert: false,
    });
  if (error) return { ok: false, message: `Upload failed: ${error.message}` };

  const {
    data: { publicUrl },
  } = supabaseAdmin().storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(objectPath);

  await prisma.category.update({
    where: { id },
    data: { iconUrl: publicUrl },
  });

  refresh();
  return { ok: true, message: "Icon uploaded." };
}

export async function clearCategoryIconAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing id." };

  await prisma.category.update({ where: { id }, data: { iconUrl: null } });
  refresh();
  return { ok: true, message: "Icon removed." };
}

export async function reorderCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const dir = String(formData.get("direction") ?? "");
  if (!id || !["up", "down"].includes(dir)) {
    return { ok: false, message: "Bad request." };
  }

  const node = await prisma.category.findUnique({
    where: { id },
    select: { id: true, parentId: true, sortOrder: true },
  });
  if (!node) return { ok: false, message: "Category not found." };

  // Siblings sorted by sortOrder, then pick the neighbour to swap with.
  const siblings = await prisma.category.findMany({
    where: { parentId: node.parentId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, sortOrder: true },
  });
  const idx = siblings.findIndex((s) => s.id === id);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return OK_SAVED;

  const a = siblings[idx];
  const b = siblings[swapIdx];
  await prisma.$transaction([
    prisma.category.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.category.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);

  // If the pair share the same sortOrder, rewrite the whole sibling list
  // to consecutive integers so future swaps always have room to move.
  if (a.sortOrder === b.sortOrder) {
    const fresh = await prisma.category.findMany({
      where: { parentId: node.parentId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    await prisma.$transaction(
      fresh.map((f, i) =>
        prisma.category.update({ where: { id: f.id }, data: { sortOrder: i } }),
      ),
    );
  }

  refresh();
  return OK_SAVED;
}

// ═══════════════════════════════════════════════════════════════════════
// BRAND
// ═══════════════════════════════════════════════════════════════════════

const BrandBasicSchema = z.object({
  slug: z.string().trim().max(80).optional(),
  name: z.string().trim().min(1, "Brand name is required.").max(120),
  isActive: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
  logoUrl: z.string().url().optional().or(z.literal("").transform(() => undefined)),
});

export async function createBrandAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const basic = BrandBasicSchema.safeParse(Object.fromEntries(formData));
  if (!basic.success) {
    return {
      ok: false,
      message: "Please review the highlighted fields.",
      fieldErrors: basic.error.flatten().fieldErrors,
    };
  }

  const taglines = readLocaleField(formData, "translations", "tagline");
  const stories = readLocaleField(formData, "translations", "story");

  const desired = slugify(basic.data.slug || basic.data.name);
  const taken = new Set(
    (await prisma.brand.findMany({ select: { slug: true } })).map((b) => b.slug),
  );
  const slug = bumpSlug(desired || "brand", taken);

  const created = await prisma.brand.create({
    data: {
      slug,
      name: basic.data.name,
      isActive: basic.data.isActive,
      logoUrl: basic.data.logoUrl ?? null,
      translations: {
        create: ALL_LOCALES.filter(
          (l) => (taglines[l] ?? "").length > 0 || (stories[l] ?? "").length > 0,
        ).map((l) => ({
          locale: l,
          tagline: taglines[l] || null,
          story: stories[l] || null,
        })),
      },
    },
  });

  refresh();
  redirect(`/admin/categories/brands/${created.id}?saved=1`);
}

export async function updateBrandAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing brand id." };

  const basic = BrandBasicSchema.safeParse(Object.fromEntries(formData));
  if (!basic.success) {
    return {
      ok: false,
      message: "Please review the highlighted fields.",
      fieldErrors: basic.error.flatten().fieldErrors,
    };
  }

  const taglines = readLocaleField(formData, "translations", "tagline");
  const stories = readLocaleField(formData, "translations", "story");

  // Capture old slug first so we can fan out a redirect after the update.
  const existing = await prisma.brand.findUnique({
    where: { id },
    select: { slug: true },
  });

  let slug: string | undefined;
  if (basic.data.slug && existing) {
    const desired = slugify(basic.data.slug);
    if (desired !== existing.slug) {
      const taken = new Set(
        (await prisma.brand.findMany({
          where: { NOT: { id } },
          select: { slug: true },
        })).map((b) => b.slug),
      );
      slug = bumpSlug(desired || "brand", taken);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.brand.update({
      where: { id },
      data: {
        ...(slug ? { slug } : {}),
        name: basic.data.name,
        isActive: basic.data.isActive,
        logoUrl: basic.data.logoUrl ?? null,
      },
    });
    for (const l of ALL_LOCALES) {
      const tagline = taglines[l] ?? "";
      const story = stories[l] ?? "";
      if (!tagline && !story) {
        await tx.brandTranslation.deleteMany({
          where: { brandId: id, locale: l },
        });
        continue;
      }
      await tx.brandTranslation.upsert({
        where: { brandId_locale: { brandId: id, locale: l } },
        create: {
          brandId: id,
          locale: l,
          tagline: tagline || null,
          story: story || null,
        },
        update: { tagline: tagline || null, story: story || null },
      });
    }
  });

  // Slug changed: fan out `/{locale}/shop/brand/{old}` -> new across all locales.
  if (slug && existing && existing.slug !== slug) {
    await fanOutSlugRedirect(
      "shop/brand",
      existing.slug,
      slug,
      "auto:brand-slug",
    );
  }

  refresh();
  return OK_SAVED;
}

export async function deleteBrandAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!id) return { ok: false, message: "Missing id." };
  if (confirm !== "DELETE") {
    return {
      ok: false,
      message: "Type DELETE to confirm.",
      fieldErrors: { confirm: ["Type DELETE to confirm."] },
    };
  }

  // Products pointing at this brand fall back to brandId = null.
  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({
      where: { brandId: id },
      data: { brandId: null },
    });
    await tx.brand.delete({ where: { id } });
  });

  refresh();
  redirect("/admin/categories/brands?deleted=1");
}

export async function uploadBrandLogoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing brand id." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No file selected." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, message: "File too large (max 2 MB for logos)." };
  }
  if (!["image/png", "image/webp", "image/svg+xml", "image/jpeg"].includes(file.type)) {
    return { ok: false, message: "Use PNG, WEBP, SVG, or JPG." };
  }

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const objectPath = `brands/${id}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabaseAdmin()
    .storage.from(PRODUCT_MEDIA_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      cacheControl: "31536000, immutable",
      upsert: false,
    });
  if (error) return { ok: false, message: `Upload failed: ${error.message}` };
  const {
    data: { publicUrl },
  } = supabaseAdmin().storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(objectPath);

  await prisma.brand.update({
    where: { id },
    data: { logoUrl: publicUrl },
  });
  refresh();
  return { ok: true, message: "Logo uploaded." };
}

export async function clearBrandLogoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing id." };
  await prisma.brand.update({ where: { id }, data: { logoUrl: null } });
  refresh();
  return { ok: true, message: "Logo removed." };
}

// ═══════════════════════════════════════════════════════════════════════
// INGREDIENTS
// ═══════════════════════════════════════════════════════════════════════

const IngredientSchema = z.object({
  slug: z.string().trim().max(80).optional(),
  inciName: z.string().trim().min(1, "INCI name is required.").max(160),
  isKeyAsset: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((v) => v === "on"),
  isAllergen: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((v) => v === "on"),
});

export async function createIngredientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const basic = IngredientSchema.safeParse(Object.fromEntries(formData));
  if (!basic.success) {
    return {
      ok: false,
      message: "Please review the highlighted fields.",
      fieldErrors: basic.error.flatten().fieldErrors,
    };
  }

  const displayNames = readLocaleField(formData, "translations", "displayName");
  const descs = readLocaleField(formData, "translations", "description");

  const desired = slugify(basic.data.slug || basic.data.inciName);
  const taken = new Set(
    (await prisma.ingredient.findMany({ select: { slug: true } })).map((i) => i.slug),
  );
  const slug = bumpSlug(desired || "ingredient", taken);

  const created = await prisma.ingredient.create({
    data: {
      slug,
      inciName: basic.data.inciName,
      isKeyAsset: basic.data.isKeyAsset,
      isAllergen: basic.data.isAllergen,
      translations: {
        create: ALL_LOCALES.filter((l) => (displayNames[l] ?? "").length > 0).map(
          (l) => ({
            locale: l,
            displayName: displayNames[l]!,
            description: descs[l] || null,
          }),
        ),
      },
    },
  });

  refresh();
  redirect(`/admin/categories/ingredients/${created.id}?saved=1`);
}

export async function updateIngredientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing id." };

  const basic = IngredientSchema.safeParse(Object.fromEntries(formData));
  if (!basic.success) {
    return {
      ok: false,
      message: "Please review the highlighted fields.",
      fieldErrors: basic.error.flatten().fieldErrors,
    };
  }

  const displayNames = readLocaleField(formData, "translations", "displayName");
  const descs = readLocaleField(formData, "translations", "description");

  let slug: string | undefined;
  if (basic.data.slug) {
    const desired = slugify(basic.data.slug);
    const current = await prisma.ingredient.findUnique({
      where: { id },
      select: { slug: true },
    });
    if (current && desired !== current.slug) {
      const taken = new Set(
        (await prisma.ingredient.findMany({
          where: { NOT: { id } },
          select: { slug: true },
        })).map((i) => i.slug),
      );
      slug = bumpSlug(desired || "ingredient", taken);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.ingredient.update({
      where: { id },
      data: {
        ...(slug ? { slug } : {}),
        inciName: basic.data.inciName,
        isKeyAsset: basic.data.isKeyAsset,
        isAllergen: basic.data.isAllergen,
      },
    });
    for (const l of ALL_LOCALES) {
      const displayName = displayNames[l] ?? "";
      if (!displayName) {
        await tx.ingredientTranslation.deleteMany({
          where: { ingredientId: id, locale: l },
        });
        continue;
      }
      await tx.ingredientTranslation.upsert({
        where: { ingredientId_locale: { ingredientId: id, locale: l } },
        create: {
          ingredientId: id,
          locale: l,
          displayName,
          description: descs[l] || null,
        },
        update: { displayName, description: descs[l] || null },
      });
    }
  });

  refresh();
  return OK_SAVED;
}

export async function deleteIngredientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing id." };

  // ProductIngredient + IngredientTranslation cascade on delete.
  await prisma.ingredient.delete({ where: { id } });
  refresh();
  redirect("/admin/categories/ingredients?deleted=1");
}

// ═══════════════════════════════════════════════════════════════════════
// SIMPLE TAXONOMIES — Concern / SkinType / Benefit
// ═══════════════════════════════════════════════════════════════════════

type SimpleKind = "concern" | "skin-type" | "benefit";

const SimpleSchema = z.object({
  slug: z.string().trim().max(80).optional(),
  // Benefit has an extra `icon` key (lucide icon name); others ignore it.
  icon: z.string().trim().max(60).optional(),
});

function delegate(kind: SimpleKind) {
  // Narrows Prisma delegates + fk naming. A tiny shim so the outer
  // functions don't need to branch at every call site.
  if (kind === "concern") {
    return {
      model: prisma.concern,
      tModel: prisma.concernTranslation,
      fk: "concernId" as const,
      composite: "concernId_locale" as const,
      hasIcon: false,
    };
  }
  if (kind === "skin-type") {
    return {
      model: prisma.skinType,
      tModel: prisma.skinTypeTranslation,
      fk: "skinTypeId" as const,
      composite: "skinTypeId_locale" as const,
      hasIcon: false,
    };
  }
  return {
    model: prisma.benefit,
    tModel: prisma.benefitTranslation,
    fk: "benefitId" as const,
    composite: "benefitId_locale" as const,
    hasIcon: true,
  };
}

export async function createSimpleTaxonomyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const kindRaw = String(formData.get("kind") ?? "");
  if (!isSimpleKind(kindRaw)) return { ok: false, message: "Unknown taxonomy." };

  const enLabel = String(formData.get("translations.EN.label") ?? "").trim();
  if (!enLabel) {
    return {
      ok: false,
      message: "An English label is required.",
      fieldErrors: { "translations.EN.label": ["English label is required."] },
    };
  }

  const basic = SimpleSchema.safeParse(Object.fromEntries(formData));
  if (!basic.success) {
    return {
      ok: false,
      message: "Please review the fields.",
      fieldErrors: basic.error.flatten().fieldErrors,
    };
  }

  const labels = readLocaleField(formData, "translations", "label");
  const d = delegate(kindRaw);

  const desired = slugify(basic.data.slug || enLabel);
  // slug must be unique *within the same taxonomy*.
  // @ts-expect-error — delegate union covers findMany
  const rows: { slug: string }[] = await d.model.findMany({
    select: { slug: true },
  });
  const taken = new Set<string>(rows.map((r) => r.slug));
  const slug = bumpSlug(desired || kindRaw, taken);

  // Build the create payload as a plain object and cast at the call site —
  // the three Prisma create inputs diverge too much to intersect cleanly.
  const data = {
    slug,
    ...(d.hasIcon ? { icon: basic.data.icon || null } : {}),
    translations: {
      create: ALL_LOCALES.filter((l) => (labels[l] ?? "").length > 0).map(
        (l) => ({ locale: l, label: labels[l]! }),
      ),
    },
  };

  // @ts-expect-error — delegate union covers create; data shape is uniform
  await d.model.create({ data });

  refresh();
  return { ok: true, message: "Added." };
}

export async function updateSimpleTaxonomyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const kindRaw = String(formData.get("kind") ?? "");
  if (!isSimpleKind(kindRaw)) return { ok: false, message: "Unknown taxonomy." };
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing id." };

  const enLabel = String(formData.get("translations.EN.label") ?? "").trim();
  if (!enLabel) {
    return {
      ok: false,
      message: "An English label is required.",
      fieldErrors: { "translations.EN.label": ["English label is required."] },
    };
  }

  const basic = SimpleSchema.safeParse(Object.fromEntries(formData));
  if (!basic.success) {
    return {
      ok: false,
      message: "Please review the fields.",
      fieldErrors: basic.error.flatten().fieldErrors,
    };
  }

  const labels = readLocaleField(formData, "translations", "label");
  const d = delegate(kindRaw);

  let slug: string | undefined;
  if (basic.data.slug) {
    const desired = slugify(basic.data.slug);
    // @ts-expect-error — delegate union covers findUnique
    const current = await d.model.findUnique({
      where: { id },
      select: { slug: true },
    });
    if (current && desired !== (current as { slug: string }).slug) {
      // @ts-expect-error — delegate union covers findMany
      const others: { slug: string }[] = await d.model.findMany({
        where: { NOT: { id } },
        select: { slug: true },
      });
      const taken = new Set<string>(others.map((r) => r.slug));
      slug = bumpSlug(desired || kindRaw, taken);
    }
  }

  await prisma.$transaction(async (tx) => {
    const sModel = pickModel(tx, kindRaw);
    const sTrans = pickTransModel(tx, kindRaw);

    const baseUpdate: Record<string, unknown> = {};
    if (slug) baseUpdate.slug = slug;
    if (d.hasIcon) baseUpdate.icon = basic.data.icon || null;
    // @ts-expect-error — union
    await sModel.update({ where: { id }, data: baseUpdate });

    for (const l of ALL_LOCALES) {
      const label = labels[l] ?? "";
      if (!label) {
        // @ts-expect-error — union
        await sTrans.deleteMany({ where: { [d.fk]: id, locale: l } });
        continue;
      }
      // @ts-expect-error — union (composite unique)
      await sTrans.upsert({
        where: { [d.composite]: { [d.fk]: id, locale: l } },
        create: { [d.fk]: id, locale: l, label },
        update: { label },
      });
    }
  });

  refresh();
  return OK_SAVED;
}

export async function deleteSimpleTaxonomyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const kindRaw = String(formData.get("kind") ?? "");
  if (!isSimpleKind(kindRaw)) return { ok: false, message: "Unknown taxonomy." };
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing id." };

  const d = delegate(kindRaw);
  // @ts-expect-error — union covers delete
  await d.model.delete({ where: { id } });

  refresh();
  return { ok: true, message: "Deleted." };
}

// ──────── narrow shims ──────────────────────────────────────────────────

function isSimpleKind(v: unknown): v is SimpleKind {
  return v === "concern" || v === "skin-type" || v === "benefit";
}

function pickModel(
  tx: Prisma.TransactionClient,
  kind: SimpleKind,
) {
  if (kind === "concern") return tx.concern;
  if (kind === "skin-type") return tx.skinType;
  return tx.benefit;
}
function pickTransModel(
  tx: Prisma.TransactionClient,
  kind: SimpleKind,
) {
  if (kind === "concern") return tx.concernTranslation;
  if (kind === "skin-type") return tx.skinTypeTranslation;
  return tx.benefitTranslation;
}
