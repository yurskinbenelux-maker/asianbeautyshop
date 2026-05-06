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
  /** Optional custom thumbnail. When null, the tile renders an iframe
   *  embed of the live Instagram post instead. */
  imageUrl: string | null;
  imageAlt: string | null;
  postUrl: string;
  caption: string | null;
};

/**
 * Convert an Instagram post URL into its public embed URL. Works for
 * /p/, /reel/, and /tv/ URLs. Returns null for anything that doesn't
 * match the pattern (so the section can fall back gracefully).
 *
 * The embed endpoint is a public, unauthenticated URL — no Meta dev
 * account, no API tokens. Renders the post natively (image or video
 * poster + Instagram chrome + "View on Instagram" link).
 */
export function instagramEmbedUrl(postUrl: string): string | null {
  try {
    const u = new URL(postUrl);
    // Only honour the canonical hosts. Mobile-app share URLs sometimes
    // come through as instagr.am; we normalise to instagram.com.
    if (!/^(www\.)?(instagram\.com|instagr\.am)$/i.test(u.hostname)) {
      return null;
    }
    // Match the post-id segment from /p/ABC123/, /reel/XYZ/,
    // /tv/ABC/. Trailing slashes + query params are tolerated.
    const m = u.pathname.match(/^\/(p|reel|tv|reels)\/([^/]+)\/?/i);
    if (!m) return null;
    // The "captioned" query strips the IG chrome; without it the embed
    // includes the caption + footer ("View on Instagram"). We keep
    // captioned=false (default) so visitors see the full post.
    return `https://www.instagram.com/${m[1]}/${m[2]}/embed/`;
  } catch {
    return null;
  }
}

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
