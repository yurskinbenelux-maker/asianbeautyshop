// ─────────────────────────────────────────────────────────────────────────
// Instagram showcase — server-only reads from the cache table.
//
// Posts are populated by the Graph API sync (see lib/instagram/sync.ts);
// these readers don't talk to Meta directly. If the cache is empty
// (no token configured yet, or first cron hasn't fired) the homepage
// section self-hides — see components/home/instagram-section.tsx.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { prisma } from "@/lib/prisma";

export type InstagramPostCard = {
  id: string;
  mediaId: string;
  mediaType: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  permalink: string;
  caption: string | null;
  postedAt: Date;
};

/**
 * Top N visible Instagram posts for the homepage. Ordered by IG
 * publish time (newest first) so the section always shows fresh
 * activity, with `sortOrder` as a manual override an admin can use to
 * pin a particular post on top.
 */
export async function getInstagramTilesForHome(
  limit = 6,
): Promise<InstagramPostCard[]> {
  const rows = await prisma.instagramPost.findMany({
    where: { isVisible: true },
    orderBy: [{ sortOrder: "asc" }, { postedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      mediaId: true,
      mediaType: true,
      mediaUrl: true,
      thumbnailUrl: true,
      permalink: true,
      caption: true,
      postedAt: true,
    },
  });
  return rows;
}

/** Admin variant — returns every cached post regardless of visibility. */
export async function getAllInstagramPosts(): Promise<
  Array<InstagramPostCard & { isVisible: boolean; sortOrder: number; lastSyncedAt: Date }>
> {
  const rows = await prisma.instagramPost.findMany({
    orderBy: [{ sortOrder: "asc" }, { postedAt: "desc" }],
    select: {
      id: true,
      mediaId: true,
      mediaType: true,
      mediaUrl: true,
      thumbnailUrl: true,
      permalink: true,
      caption: true,
      postedAt: true,
      isVisible: true,
      sortOrder: true,
      lastSyncedAt: true,
    },
  });
  return rows;
}

/**
 * For the homepage tile: pick the right image URL given a post's
 * media type. Videos and Reels use the thumbnail (the video file
 * URL points to .mp4 which we don't try to render inline);
 * images use the media URL directly.
 */
export function thumbnailFor(post: InstagramPostCard): string {
  if (post.mediaType === "VIDEO" && post.thumbnailUrl) {
    return post.thumbnailUrl;
  }
  return post.mediaUrl;
}

/** Convenience: is this a video post (so we should show a play overlay)? */
export function isVideoPost(post: InstagramPostCard): boolean {
  return post.mediaType === "VIDEO";
}
