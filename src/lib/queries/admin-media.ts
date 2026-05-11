// ─────────────────────────────────────────────────────────────────────────
// Admin media queries.
//
// The media library reads from the Media table (the canonical source —
// Supabase Storage is just the file bytes). Each row is either linked to
// a product via Media.productId, or orphan (productId null + no banner
// attachment). Orphan rows are what an admin will want to clean up.
// ─────────────────────────────────────────────────────────────────────────

import { Locale, MediaKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MediaScope = "all" | "linked" | "orphan";

export type AdminMediaRow = {
  id: string;
  url: string;
  alt: string | null;
  kind: MediaKind;
  isPrimary: boolean;
  createdAt: Date;
  productId: string | null;
  productName: string | null; // EN
  productSlug: string | null; // EN
  bannerCount: number; // >0 means it's used on a homepage banner
};

export type AdminMediaFilters = {
  scope: MediaScope;
  q: string; // free-text search over alt or product name
};

export type AdminMediaPage = {
  rows: AdminMediaRow[];
  total: number;
  counts: { all: number; linked: number; orphan: number };
};

const PAGE_SIZE = 60;

export async function listAdminMedia(
  filters: AdminMediaFilters,
  page: number = 1,
): Promise<AdminMediaPage> {
  // Quick totals for the filter chips — always the same numbers regardless
  // of the current filter (so an admin can see where the noise is).
  const [allCount, linkedCount, orphanCount] = await Promise.all([
    prisma.media.count(),
    prisma.media.count({ where: { productId: { not: null } } }),
    prisma.media.count({ where: { productId: null } }),
  ]);

  // Build the page query from the scope filter.
  const where: Prisma.MediaWhereInput = {};
  if (filters.scope === "linked") where.productId = { not: null };
  if (filters.scope === "orphan") where.productId = null;

  // Free-text search: match alt text OR the product's EN name.
  const q = filters.q.trim();
  if (q.length > 0) {
    where.OR = [
      { alt: { contains: q, mode: "insensitive" } },
      {
        product: {
          translations: {
            some: {
              locale: Locale.EN,
              name: { contains: q, mode: "insensitive" },
            },
          },
        },
      },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.media.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: {
          select: {
            id: true,
            translations: {
              where: { locale: Locale.EN },
              select: { name: true, slug: true },
            },
          },
        },
        banners: { select: { id: true } },
      },
    }),
    prisma.media.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      url: r.url,
      alt: r.alt,
      kind: r.kind,
      isPrimary: r.isPrimary,
      createdAt: r.createdAt,
      productId: r.productId,
      productName: r.product?.translations[0]?.name ?? null,
      productSlug: r.product?.translations[0]?.slug ?? null,
      bannerCount: r.banners.length,
    })),
    total,
    counts: { all: allCount, linked: linkedCount, orphan: orphanCount },
  };
}

export const MEDIA_PAGE_SIZE = PAGE_SIZE;

/**
 * Lightweight product list for the media drawer's product picker. Each
 * product surfaces its EN name + slug — we don't bother localising the
 * picker because admin is EN-only. Excludes archived products. Returns
 * EVERY product, sorted A→Z; the catalogue is small (≈35 SKUs) so
 * pagination is wasted complexity.
 */
export type MediaPickerProduct = {
  id: string;
  name: string;
  slug: string;
};

export async function listProductsForMediaPicker(): Promise<
  MediaPickerProduct[]
> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      translations: {
        where: { locale: Locale.EN },
        select: { name: true, slug: true },
      },
    },
  });

  return products
    .map((p) => ({
      id: p.id,
      name: p.translations[0]?.name ?? "(untitled)",
      slug: p.translations[0]?.slug ?? p.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────────────
// Journal-post picker — feeds the "Attach to a journal article" section
// in the media drawer. We use the EN translation as the human label
// (every post is required to have an EN row for the listing fallback).
// ─────────────────────────────────────────────────────────────────────────

export type MediaPickerJournalPost = {
  id: string;
  title: string;
  /** Indicates whether each slot already has an image — admin UI can show
   *  "(replace)" hints so an admin knows what she's overwriting. */
  hasCover: boolean;
  hasHero: boolean;
};

export async function listJournalPostsForMediaPicker(): Promise<
  MediaPickerJournalPost[]
> {
  const posts = await prisma.journalPost.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      coverUrl: true,
      heroUrl: true,
      translations: {
        where: { locale: Locale.EN },
        select: { title: true },
        take: 1,
      },
    },
  });

  return posts
    .map((p) => ({
      id: p.id,
      title: p.translations[0]?.title ?? "(untitled)",
      hasCover: !!p.coverUrl,
      hasHero: !!p.heroUrl,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * For a given URL, who references it? Used by the drawer to surface
 * "this image is linked to N products" so an admin can see reuse at a
 * glance. Each reference is its own Media row (one per product).
 */
export type MediaUsage = {
  mediaId: string;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  isPrimary: boolean;
};

export async function listUsagesForUrl(url: string): Promise<MediaUsage[]> {
  const rows = await prisma.media.findMany({
    where: { url },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      productId: true,
      isPrimary: true,
      product: {
        select: {
          translations: {
            where: { locale: Locale.EN },
            select: { name: true, slug: true },
          },
        },
      },
    },
  });

  return rows.map((r) => ({
    mediaId: r.id,
    productId: r.productId,
    productName: r.product?.translations[0]?.name ?? null,
    productSlug: r.product?.translations[0]?.slug ?? null,
    isPrimary: r.isPrimary,
  }));
}
