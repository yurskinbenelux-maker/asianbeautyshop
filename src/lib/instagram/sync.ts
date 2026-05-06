// ─────────────────────────────────────────────────────────────────────────
// Instagram sync — pulls posts from the Graph API and upserts them
// into the InstagramPost cache table.
//
// Triggered by:
//   · The cron at /api/cron/instagram-sync (cron-job.org pings every
//     few hours; that's the production driver).
//   · The "Sync now" button in /admin/marketing/instagram (manual).
//
// Idempotency:
//   · `mediaId` is the upsert key — re-running on the same set of
//     posts is a no-op apart from refreshing CDN URLs (Meta rotates
//     these every couple of weeks).
//   · Posts that disappear from IG (deleted by Sofia) are NOT
//     deleted from our cache automatically — that would risk
//     wiping out the section if Meta returns an empty page during
//     a transient API hiccup. Instead we age them out: anything
//     not seen in the last ~30 days could be pruned by a separate
//     sweep, but for now we leave that as a manual call.
//
// Fail modes — all written to instagram.lastSync as `error`:
//   · Token expired (subcode 463) → admin shows red banner
//   · IG user ID wrong → admin shows red banner
//   · Network blip → admin shows red banner; next cron retries
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { prisma } from "@/lib/prisma";
import { fetchUserMedia } from "@/lib/instagram/graph-api";
import {
  readIgConfig,
  writeLastSync,
  type IgConfig,
} from "@/lib/instagram/settings";

const SYNC_LIMIT = 25;

export type SyncResult =
  | {
      ok: true;
      fetched: number;
      upserted: number;
      durationMs: number;
    }
  | {
      ok: false;
      error: string;
      durationMs: number;
    };

/**
 * Run a full sync. Reads config from Setting, fetches media, upserts
 * each row by mediaId, stamps `instagram.lastSync` so admin can see
 * the result without scraping logs.
 */
export async function syncInstagramPosts(): Promise<SyncResult> {
  const startedAt = Date.now();
  const config = await readIgConfig();
  if (!config) {
    const error = "Instagram is not configured — set the access token first";
    await writeLastSync({
      at: new Date().toISOString(),
      count: 0,
      error,
      ok: false,
    });
    return { ok: false, error, durationMs: Date.now() - startedAt };
  }

  return await runSyncWithConfig(config, startedAt);
}

async function runSyncWithConfig(
  config: IgConfig,
  startedAt: number,
): Promise<SyncResult> {
  let fetchedItems;
  try {
    fetchedItems = await fetchUserMedia({
      accessToken: config.accessToken,
      igUserId: config.igUserId,
      limit: SYNC_LIMIT,
    });
  } catch (err) {
    const error =
      err instanceof Error ? err.message : "Unknown Graph API error";
    await writeLastSync({
      at: new Date().toISOString(),
      count: 0,
      error,
      ok: false,
    });
    return { ok: false, error, durationMs: Date.now() - startedAt };
  }

  // Upsert each item. We don't use prisma.$transaction so a single
  // bad row doesn't roll back the whole batch — log + skip instead.
  let upserted = 0;
  const now = new Date();

  for (const item of fetchedItems) {
    try {
      await prisma.instagramPost.upsert({
        where: { mediaId: item.id },
        create: {
          mediaId: item.id,
          mediaType: item.media_type,
          mediaUrl: item.media_url,
          thumbnailUrl: item.thumbnail_url ?? null,
          permalink: item.permalink,
          caption: item.caption ?? null,
          postedAt: new Date(item.timestamp),
          lastSyncedAt: now,
        },
        update: {
          mediaType: item.media_type,
          mediaUrl: item.media_url,
          thumbnailUrl: item.thumbnail_url ?? null,
          permalink: item.permalink,
          caption: item.caption ?? null,
          postedAt: new Date(item.timestamp),
          lastSyncedAt: now,
        },
      });
      upserted += 1;
    } catch (err) {
      console.error("[ig-sync] upsert failed for", item.id, err);
    }
  }

  await writeLastSync({
    at: now.toISOString(),
    count: upserted,
    ok: true,
  });

  return {
    ok: true,
    fetched: fetchedItems.length,
    upserted,
    durationMs: Date.now() - startedAt,
  };
}
