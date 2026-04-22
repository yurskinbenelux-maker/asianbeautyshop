// ─────────────────────────────────────────────────────────────────────────
// Wishlist queries + mutations.
//
// Wishlist is a very simple join table (WishlistItem).  Every function
// here is user-scoped.  The UI reads via listMyWishlist + isWishlisted,
// and mutates via toggleMyWishlist (called from a "Save" heart on PDPs).
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { Locale } from "@prisma/client";

export type WishlistItemView = {
  id: string;
  addedAt: Date;
  productId: string;
  productSlug: string;
  productName: string;
  brandName: string | null;
  imageUrl: string | null;
  price: number;
  comparePrice: number | null;
  volumeMl: number | null;
};

export async function listMyWishlist(
  userId: string,
  urlLocale: string,
): Promise<WishlistItemView[]> {
  const prismaLocale: Locale =
    urlLocale === "nl"
      ? Locale.NL
      : urlLocale === "fr"
        ? Locale.FR
        : urlLocale === "ru"
          ? Locale.RU
          : Locale.EN;

  const rows = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        include: {
          brand: { select: { name: true } },
          media: {
            where: { isPrimary: true },
            select: { url: true },
            take: 1,
          },
          translations: {
            where: { locale: { in: [prismaLocale, Locale.EN] } },
            select: { locale: true, name: true, slug: true },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const t =
      row.product.translations.find((x) => x.locale === prismaLocale) ??
      row.product.translations.find((x) => x.locale === Locale.EN);
    return {
      id: row.id,
      addedAt: row.createdAt,
      productId: row.productId,
      productSlug: t?.slug ?? "",
      productName: t?.name ?? row.product.sku,
      brandName: row.product.brand?.name ?? null,
      imageUrl: row.product.media[0]?.url ?? null,
      price: Number(row.product.price),
      comparePrice: row.product.comparePrice
        ? Number(row.product.comparePrice)
        : null,
      volumeMl: row.product.volumeMl,
    };
  });
}

/** Cheap existence check — used by the heart icon on PDPs. */
export async function isWishlisted(
  userId: string,
  productId: string,
): Promise<boolean> {
  const count = await prisma.wishlistItem.count({
    where: { userId, productId },
  });
  return count > 0;
}

/** Returns a Set for O(1) lookups when rendering product card grids. */
export async function getWishlistedProductIds(
  userId: string,
): Promise<Set<string>> {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}

/**
 * Add or remove.  Returns the new state (`true` = now wishlisted) so the
 * client can flip the heart without re-fetching.
 */
export async function toggleMyWishlist(
  userId: string,
  productId: string,
): Promise<{ wishlisted: boolean }> {
  const existing = await prisma.wishlistItem.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    return { wishlisted: false };
  }

  await prisma.wishlistItem.create({
    data: { userId, productId },
  });
  return { wishlisted: true };
}

export async function removeFromMyWishlist(
  userId: string,
  productId: string,
): Promise<void> {
  await prisma.wishlistItem
    .delete({
      where: { userId_productId: { userId, productId } },
    })
    .catch(() => {
      /* idempotent — missing row is fine */
    });
}
