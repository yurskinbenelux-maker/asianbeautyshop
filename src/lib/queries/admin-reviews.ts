// ─────────────────────────────────────────────────────────────────────────
// Admin reviews — moderation queue queries.
//
// Reviews default to isPublished=false, so without an admin queue nothing
// ever surfaces on product pages. The list filters by a "scope" (pending /
// published / all) and the counts feed the filter chip labels.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import { Locale } from "@prisma/client";

export type ReviewScope = "pending" | "published" | "all";

export type ReviewRow = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  customerName: string;
  customerEmail: string | null;
  rating: number;
  title: string | null;
  body: string;
  locale: Locale;
  isVerified: boolean;
  isPublished: boolean;
  createdAt: Date;
};

export type ReviewCounts = {
  pending: number;
  published: number;
  all: number;
};

const PAGE_SIZE = 30;

export async function listAdminReviews(
  scope: ReviewScope,
  page = 1,
): Promise<{ rows: ReviewRow[]; total: number; counts: ReviewCounts }> {
  const where =
    scope === "pending"
      ? { isPublished: false }
      : scope === "published"
      ? { isPublished: true }
      : {};

  const [reviews, total, pendingCount, publishedCount, allCount] =
    await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
        include: {
          product: {
            select: {
              id: true,
              translations: {
                // We just need one localised name for the row — prefer EN
                // since the admin is always in EN.
                where: { locale: "EN" },
                select: { name: true, slug: true },
                take: 1,
              },
            },
          },
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.review.count({ where }),
      prisma.review.count({ where: { isPublished: false } }),
      prisma.review.count({ where: { isPublished: true } }),
      prisma.review.count(),
    ]);

  const rows: ReviewRow[] = reviews.map((r) => {
    const nameRow = r.product.translations[0];
    // Display priority: stored authorName (set by guest reviews + new
    // verified writes) → User's firstName + last → "Guest". Email
    // priority: stored authorEmail (guest) → User's email (verified).
    const fromUser = formatName(r.user);
    const customerName =
      r.authorName?.trim() ?? (fromUser !== "Guest" ? fromUser : "Guest");
    const customerEmail = r.authorEmail ?? r.user?.email ?? null;
    return {
      id: r.id,
      productId: r.productId,
      productName: nameRow?.name ?? "(untitled product)",
      productSlug: nameRow?.slug ?? "",
      customerName,
      customerEmail,
      rating: r.rating,
      title: r.title,
      body: r.body,
      locale: r.locale,
      isVerified: r.isVerified,
      isPublished: r.isPublished,
      createdAt: r.createdAt,
    };
  });

  return {
    rows,
    total,
    counts: {
      pending: pendingCount,
      published: publishedCount,
      all: allCount,
    },
  };
}

function formatName(
  user: { firstName: string | null; lastName: string | null } | null,
): string {
  if (!user) return "Guest";
  const parts = [user.firstName, user.lastName].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" ") : "Guest";
}
