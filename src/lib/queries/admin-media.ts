// ─────────────────────────────────────────────────────────────────────────
// Admin media queries.
//
// The media library reads from the Media table (the canonical source —
// Supabase Storage is just the file bytes). Each row is either linked to
// a product via Media.productId, or orphan (productId null + no banner
// attachment). Orphan rows are what Sofia will want to clean up.
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
  // of the current filter (so Sofia can see where the noise is).
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
