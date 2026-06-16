import { ProductStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { latestSitemapDate } from "@/lib/sitemap/dates";

const publishedProductWhere = {
  status: ProductStatus.PUBLISHED,
  deletedAt: null,
} as const;

/** Static pages sitemap stamps every entry with request-time now. */
export function getPagesSitemapMaxLastmod(): Date {
  return new Date();
}

/** Max product lastmod across product, translations, media, and variants. */
export async function getProductsSitemapMaxLastmod(): Promise<Date> {
  const [productMax, translationMax, mediaMax, variantMax] = await Promise.all([
    prisma.product.aggregate({
      where: publishedProductWhere,
      _max: { updatedAt: true },
    }),
    prisma.productTranslation.aggregate({
      where: { product: publishedProductWhere },
      _max: { updatedAt: true },
    }),
    prisma.media.aggregate({
      where: { product: publishedProductWhere },
      _max: { updatedAt: true },
    }),
    prisma.productVariant.aggregate({
      where: { product: publishedProductWhere },
      _max: { updatedAt: true },
    }),
  ]);

  return latestSitemapDate(
    productMax._max.updatedAt,
    translationMax._max.updatedAt,
    mediaMax._max.updatedAt,
    variantMax._max.updatedAt,
  );
}

export async function getCategoriesSitemapMaxLastmod(): Promise<Date> {
  const result = await prisma.category.aggregate({
    where: { isActive: true },
    _max: { updatedAt: true },
  });
  return result._max.updatedAt ?? new Date(0);
}

export async function getBrandsSitemapMaxLastmod(): Promise<Date> {
  const result = await prisma.brand.aggregate({
    where: { isActive: true },
    _max: { updatedAt: true },
  });
  return result._max.updatedAt ?? new Date(0);
}

export async function getIngredientsSitemapMaxLastmod(): Promise<Date> {
  const result = await prisma.ingredient.aggregate({
    where: {
      productLinks: {
        some: { product: publishedProductWhere },
      },
    },
    _max: { updatedAt: true },
  });
  return result._max.updatedAt ?? new Date(0);
}
