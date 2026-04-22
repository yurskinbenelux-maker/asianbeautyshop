// ─────────────────────────────────────────────────────────────────────────
// Admin-side taxonomy queries.
//
// "Taxonomies" = everything used to organise the catalogue: categories,
// brands, concerns, skin types, benefits, ingredients. These all follow
// the same pattern (core row + per-locale translations + product-link
// count), so the read helpers live together.
// ─────────────────────────────────────────────────────────────────────────

import { Locale, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ALL_LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

// ──────── categories ────────────────────────────────────────────────────

export type AdminCategoryNode = {
  id: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  iconUrl: string | null;
  translations: Record<Locale, { name: string; description: string | null }>;
  productCount: number;
  children: AdminCategoryNode[];
};

export async function listAdminCategories(): Promise<AdminCategoryNode[]> {
  const [rows, counts] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        translations: {
          select: { locale: true, name: true, description: true },
        },
      },
    }),
    prisma.productCategory.groupBy({
      by: ["categoryId"],
      _count: { _all: true },
    }),
  ]);

  const countById = new Map(
    counts.map((c) => [c.categoryId, c._count._all]),
  );

  const byId = new Map<string, AdminCategoryNode>();
  for (const r of rows) {
    const translations = emptyTranslations<{
      name: string;
      description: string | null;
    }>((l) => ({ name: "", description: null }));
    for (const t of r.translations) {
      translations[t.locale] = { name: t.name, description: t.description };
    }
    byId.set(r.id, {
      id: r.id,
      slug: r.slug,
      parentId: r.parentId,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      iconUrl: r.iconUrl,
      translations,
      productCount: countById.get(r.id) ?? 0,
      children: [],
    });
  }

  // Hang children under parents; roots are whatever has no parent or a
  // parent we somehow don't have in memory (shouldn't happen but defensive).
  const roots: AdminCategoryNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export type AdminCategoryDetail = Awaited<ReturnType<typeof getAdminCategory>>;

export async function getAdminCategory(id: string) {
  const row = await prisma.category.findUnique({
    where: { id },
    include: {
      translations: true,
      children: {
        select: { id: true, slug: true, translations: { where: { locale: Locale.EN } } },
      },
    },
  });
  if (!row) return null;

  // A flat list of other categories, used as "parent" options.
  // We exclude this node's own subtree so you can't cycle it.
  const allOthers = await prisma.category.findMany({
    select: {
      id: true,
      slug: true,
      parentId: true,
      translations: {
        where: { locale: Locale.EN },
        select: { name: true },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const descendantIds = collectDescendantIds(allOthers, id);
  const parentOptions = allOthers.filter(
    (c) => c.id !== id && !descendantIds.has(c.id),
  );

  return { category: row, parentOptions };
}

function collectDescendantIds(
  rows: { id: string; parentId: string | null }[],
  rootId: string,
): Set<string> {
  const out = new Set<string>();
  const childrenByParent = new Map<string | null, string[]>();
  for (const r of rows) {
    const list = childrenByParent.get(r.parentId) ?? [];
    list.push(r.id);
    childrenByParent.set(r.parentId, list);
  }
  const walk = (id: string) => {
    for (const kid of childrenByParent.get(id) ?? []) {
      if (!out.has(kid)) {
        out.add(kid);
        walk(kid);
      }
    }
  };
  walk(rootId);
  return out;
}

// ──────── brands ─────────────────────────────────────────────────────────

export type AdminBrandRow = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  isActive: boolean;
  productCount: number;
};

export async function listAdminBrands(): Promise<AdminBrandRow[]> {
  const [rows, counts] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.product.groupBy({
      by: ["brandId"],
      where: { brandId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countByBrand = new Map(
    counts.map((c) => [c.brandId as string, c._count._all]),
  );

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    logoUrl: r.logoUrl,
    isActive: r.isActive,
    productCount: countByBrand.get(r.id) ?? 0,
  }));
}

export async function getAdminBrand(id: string) {
  return prisma.brand.findUnique({
    where: { id },
    include: { translations: true },
  });
}

// ──────── ingredients ───────────────────────────────────────────────────

export type AdminIngredientRow = {
  id: string;
  slug: string;
  inciName: string;
  isKeyAsset: boolean;
  isAllergen: boolean;
  productCount: number;
};

export async function listAdminIngredients(): Promise<AdminIngredientRow[]> {
  const [rows, counts] = await Promise.all([
    prisma.ingredient.findMany({ orderBy: { inciName: "asc" } }),
    prisma.productIngredient.groupBy({
      by: ["ingredientId"],
      _count: { _all: true },
    }),
  ]);

  const countBy = new Map(counts.map((c) => [c.ingredientId, c._count._all]));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    inciName: r.inciName,
    isKeyAsset: r.isKeyAsset,
    isAllergen: r.isAllergen,
    productCount: countBy.get(r.id) ?? 0,
  }));
}

export async function getAdminIngredient(id: string) {
  return prisma.ingredient.findUnique({
    where: { id },
    include: { translations: true },
  });
}

// ──────── simple taxonomies (concern, skin type, benefit) ───────────────
// These three share one API shape: slug + per-locale label(+icon on Benefit).

export type SimpleTaxonomyKind = "concern" | "skin-type" | "benefit";

export type AdminSimpleTaxonomyRow = {
  id: string;
  slug: string;
  icon?: string | null;
  labels: Record<Locale, string>;
  productCount: number;
};

export async function listSimpleTaxonomy(
  kind: SimpleTaxonomyKind,
): Promise<AdminSimpleTaxonomyRow[]> {
  if (kind === "concern") {
    const [rows, counts] = await Promise.all([
      prisma.concern.findMany({
        orderBy: { slug: "asc" },
        include: { translations: true },
      }),
      prisma.productConcern.groupBy({
        by: ["concernId"],
        _count: { _all: true },
      }),
    ]);
    const countBy = new Map(counts.map((c) => [c.concernId, c._count._all]));
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      labels: labelsFromTranslations(r.translations.map((t) => ({
        locale: t.locale,
        label: t.label,
      }))),
      productCount: countBy.get(r.id) ?? 0,
    }));
  }
  if (kind === "skin-type") {
    const [rows, counts] = await Promise.all([
      prisma.skinType.findMany({
        orderBy: { slug: "asc" },
        include: { translations: true },
      }),
      prisma.productSkinType.groupBy({
        by: ["skinTypeId"],
        _count: { _all: true },
      }),
    ]);
    const countBy = new Map(counts.map((c) => [c.skinTypeId, c._count._all]));
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      labels: labelsFromTranslations(r.translations.map((t) => ({
        locale: t.locale,
        label: t.label,
      }))),
      productCount: countBy.get(r.id) ?? 0,
    }));
  }
  // kind === "benefit"
  const [rows, counts] = await Promise.all([
    prisma.benefit.findMany({
      orderBy: { slug: "asc" },
      include: { translations: true },
    }),
    prisma.productBenefit.groupBy({
      by: ["benefitId"],
      _count: { _all: true },
    }),
  ]);
  const countBy = new Map(counts.map((c) => [c.benefitId, c._count._all]));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    icon: r.icon,
    labels: labelsFromTranslations(r.translations.map((t) => ({
      locale: t.locale,
      label: t.label,
    }))),
    productCount: countBy.get(r.id) ?? 0,
  }));
}

// ──────── helpers ───────────────────────────────────────────────────────

function emptyTranslations<T>(factory: (l: Locale) => T): Record<Locale, T> {
  return ALL_LOCALES.reduce(
    (acc, l) => {
      acc[l] = factory(l);
      return acc;
    },
    {} as Record<Locale, T>,
  );
}

function labelsFromTranslations(
  rows: { locale: Locale; label: string }[],
): Record<Locale, string> {
  const out = emptyTranslations(() => "");
  for (const r of rows) out[r.locale] = r.label;
  return out;
}

// Type-only export so Prisma's Prisma namespace stays used (tsc complains
// otherwise when we only ever used Prisma as a value).
export type _Prisma = Prisma.CategoryInclude;
