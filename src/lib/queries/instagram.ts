// ─────────────────────────────────────────────────────────────────────────
// Instagram showcase — server-only reads. The InstagramPost model is a
// curated grid (we don't auto-pull from Meta), so the public read is a
// straight findMany ordered by sortOrder + createdAt.
//
// Used by:
//   · The homepage section under <JournalTeaser> (InstagramSection
//     component) — top 6 active posts.
//   · The admin /admin/marketing/instagram listing (full set including
//     hidden rows) — see queries/admin-instagram.ts for that variant.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { prisma } from "@/lib/prisma";

export type InstagramPostCard = {
  id: string;
  imageUrl: string;
  imageAlt: string | null;
  postUrl: string;
  caption: string | null;
};

/**
 * Top N active Instagram tiles for the homepage. `limit` defaults to
 * 6 — a 3×2 grid on desktop and 2×3 on mobile reads as "we're alive
 * on IG" without overwhelming the page.
 *
 * Empty result is fine — the section component self-hides when zero
 * tiles come back, so the homepage never shows a half-empty surface.
 */
export async function getInstagramTilesForHome(
  limit = 6,
): Promise<InstagramPostCard[]> {
  const rows = await prisma.instagramPost.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      imageUrl: true,
      imageAlt: true,
      postUrl: true,
      caption: true,
    },
  });
  return rows;
}

/** Admin variant — returns every post regardless of isActive,
 *  ordered the same way. Used by the admin list page. */
export async function getAllInstagramPosts(): Promise<
  Array<InstagramPostCard & { isActive: boolean; sortOrder: number }>
> {
  const rows = await prisma.instagramPost.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      imageUrl: true,
      imageAlt: true,
      postUrl: true,
      caption: true,
      isActive: true,
      sortOrder: true,
    },
  });
  return rows;
}
