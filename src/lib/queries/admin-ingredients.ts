// ─────────────────────────────────────────────────────────────────────────
// Admin-side Ingredient queries.
//
// Separate from `src/lib/queries/ingredients.ts` (public) so the bundle
// boundary stays clean — the admin list shows *every* row, including
// ingredients currently not linked to any product, whereas the public
// queries only surface rows that have at least one published product.
//
// Shape mirrors the admin-testimonials helpers so the UI patterns stay
// consistent across the admin.
// ─────────────────────────────────────────────────────────────────────────

import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AdminIngredientListRow = {
  id: string;
  slug: string;
  inciName: string;
  isKeyAsset: boolean;
  isAllergen: boolean;
  createdAt: Date;
  updatedAt: Date;
  translationCount: number;
  productCount: number;
  // EN display name for the list preview; falls back to inciName.
  displayPreview: string;
};

export type AdminIngredientTranslationValues = {
  displayName: string;
  description: string;
};

export type AdminIngredientDetail = {
  id: string;
  slug: string;
  inciName: string;
  isKeyAsset: boolean;
  isAllergen: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Dense EN/NL/FR/RU record so the form can index without undefined checks.
  translations: Record<Locale, AdminIngredientTranslationValues | null>;
  // Products currently linked to this ingredient — helps an admin decide
  // whether it's safe to rename/archive.
  linkedProducts: Array<{
    productId: string;
    productSku: string;
    productNameEn: string;
    isKey: boolean;
  }>;
};

/** Every ingredient, alphabetical by INCI name. */
export async function listAdminIngredients(): Promise<
  AdminIngredientListRow[]
> {
  const rows = await prisma.ingredient.findMany({
    orderBy: [{ isKeyAsset: "desc" }, { inciName: "asc" }],
    include: {
      translations: { select: { locale: true, displayName: true } },
      _count: { select: { productLinks: true } },
    },
  });

  return rows.map((r) => {
    const en = r.translations.find((t) => t.locale === Locale.EN);
    return {
      id: r.id,
      slug: r.slug,
      inciName: r.inciName,
      isKeyAsset: r.isKeyAsset,
      isAllergen: r.isAllergen,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      translationCount: r.translations.length,
      productCount: r._count.productLinks,
      displayPreview: en?.displayName ?? r.inciName,
    };
  });
}

/** Edit-form data. Returns null when the id doesn't resolve. */
export async function getAdminIngredient(
  id: string,
): Promise<AdminIngredientDetail | null> {
  const row = await prisma.ingredient.findUnique({
    where: { id },
    include: {
      translations: {
        select: {
          locale: true,
          displayName: true,
          description: true,
        },
      },
      productLinks: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              translations: {
                where: { locale: Locale.EN },
                select: { name: true },
              },
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  const byLocale: AdminIngredientDetail["translations"] = {
    EN: null,
    NL: null,
    FR: null,
    RU: null,
  };
  for (const t of row.translations) {
    byLocale[t.locale] = {
      displayName: t.displayName,
      description: t.description ?? "",
    };
  }

  return {
    id: row.id,
    slug: row.slug,
    inciName: row.inciName,
    isKeyAsset: row.isKeyAsset,
    isAllergen: row.isAllergen,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    translations: byLocale,
    linkedProducts: row.productLinks.map((link) => ({
      productId: link.product.id,
      productSku: link.product.sku,
      productNameEn:
        link.product.translations[0]?.name ?? link.product.sku,
      isKey: link.isKey,
    })),
  };
}

/**
 * Slug uniqueness check. Used by server actions to surface a friendly
 * error instead of a raw Prisma violation. `ignoreId` lets callers
 * exclude the row they're editing.
 */
export async function isSlugTaken(
  slug: string,
  ignoreId?: string,
): Promise<boolean> {
  const existing = await prisma.ingredient.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!existing) return false;
  if (ignoreId && existing.id === ignoreId) return false;
  return true;
}
