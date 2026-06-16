import { Locale } from "@prisma/client";

import { routing } from "@/i18n/routing";
import {
  getAllActiveBrandSlugs,
  getAllActiveCategorySlugs,
  getAllPublishedProductSlugs,
  type ProductSitemapEntry,
} from "@/lib/queries/products";
import { getAllSitemapIngredientSlugs } from "@/lib/queries/ingredients";
import { LEGAL_PAGE_KEYS } from "@/lib/queries/pages";
import { latestSitemapDate } from "@/lib/sitemap/dates";
import {
  getProductsSitemapMaxLastmod,
} from "@/lib/sitemap/index-lastmod";
import { getSitemapOrigin } from "@/lib/sitemap/origin";

const LOCALES = routing.locales;

export type SitemapEntry = {
  loc: string;
  lastModified: Date;
};

export type SitemapIndexEntry = {
  loc: string;
  lastModified: Date;
};

function toPrismaLocale(urlLocale: string): Locale {
  return (
    {
      en: Locale.EN,
      nl: Locale.NL,
      fr: Locale.FR,
      ru: Locale.RU,
    } as const
  )[urlLocale] ?? Locale.EN;
}

function productSitemapLastmod(
  product: ProductSitemapEntry,
  urlLocale: string,
): Date {
  const prismaLocale = toPrismaLocale(urlLocale);
  const translationUpdatedAt = product.updatedAtByLocale[prismaLocale];

  return latestSitemapDate(
    product.productUpdatedAt,
    translationUpdatedAt,
    product.mediaUpdatedAt,
    product.variantUpdatedAt,
  );
}

/** Static listing pages + legal — no PDPs, categories, brands, or ingredient detail. */
export async function buildPagesSitemapEntries(): Promise<SitemapEntry[]> {
  const origin = getSitemapOrigin();
  const now = new Date();
  const entries: SitemapEntry[] = [];

  const staticTails = [
    "",
    "/shop",
    "/sale",
    "/new",
    "/brands",
    "/ingredients",
    "/journal",
    "/quiz",
    "/rituals",
    "/faq",
    "/shipping",
    "/contact",
  ];

  for (const tail of staticTails) {
    for (const locale of LOCALES) {
      entries.push({
        loc: `${origin}/${locale}${tail}`,
        lastModified: now,
      });
    }
  }

  for (const key of LEGAL_PAGE_KEYS) {
    for (const locale of LOCALES) {
      entries.push({
        loc: `${origin}/${locale}/legal/${key}`,
        lastModified: now,
      });
    }
  }

  return entries;
}

export async function buildCategorySitemapEntries(): Promise<SitemapEntry[]> {
  const origin = getSitemapOrigin();
  const entries: SitemapEntry[] = [];
  const categories = await getAllActiveCategorySlugs();

  for (const category of categories) {
    for (const locale of LOCALES) {
      entries.push({
        loc: `${origin}/${locale}/shop/category/${category.slug}`,
        lastModified: category.updatedAt,
      });
    }
  }

  return entries;
}

export async function buildBrandSitemapEntries(): Promise<SitemapEntry[]> {
  const origin = getSitemapOrigin();
  const entries: SitemapEntry[] = [];
  const brands = await getAllActiveBrandSlugs();

  for (const brand of brands) {
    for (const locale of LOCALES) {
      entries.push({
        loc: `${origin}/${locale}/shop/brand/${brand.slug}`,
        lastModified: brand.updatedAt,
      });
    }
  }

  return entries;
}

export async function buildIngredientSitemapEntries(): Promise<SitemapEntry[]> {
  const origin = getSitemapOrigin();
  const entries: SitemapEntry[] = [];
  const ingredients = await getAllSitemapIngredientSlugs();

  for (const ingredient of ingredients) {
    for (const locale of LOCALES) {
      entries.push({
        loc: `${origin}/${locale}/ingredients/${ingredient.slug}`,
        lastModified: ingredient.updatedAt,
      });
    }
  }

  return entries;
}

/** Published product PDP URLs — one entry per locale. */
export async function buildProductSitemapEntries(): Promise<SitemapEntry[]> {
  const origin = getSitemapOrigin();
  const entries: SitemapEntry[] = [];
  const products = await getAllPublishedProductSlugs();

  for (const product of products) {
    const enSlug = product.slugByLocale[Locale.EN];
    if (!enSlug) continue;

    for (const locale of LOCALES) {
      const prismaLocale = toPrismaLocale(locale);
      const slug = product.slugByLocale[prismaLocale] ?? enSlug;
      if (!slug?.trim()) continue;

      entries.push({
        loc: `${origin}/${locale}/shop/${slug}`,
        lastModified: productSitemapLastmod(product, locale),
      });
    }
  }

  return entries;
}

/** Child sitemap list for /sitemap.xml index — index only, no page URLs. */
export async function buildSitemapIndexEntries(): Promise<SitemapIndexEntry[]> {
  const origin = getSitemapOrigin();
  const productsLastmod = await getProductsSitemapMaxLastmod();

  // GSC debug: products-only index. Add sitemap-pages.xml, then categories,
  // brands, ingredients one at a time — test each in GSC before expanding.
  return [
    {
      loc: `${origin}/sitemap-products.xml`,
      lastModified: productsLastmod,
    },
  ];
}
