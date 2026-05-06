// ─────────────────────────────────────────────────────────────────────────
// Instagram settings — read/write helpers backed by the generic Setting
// table. Centralised so the keys + shape are defined in one place.
//
// Keys:
//   instagram.config         → { accessToken, igUserId, username }
//   instagram.lastSync       → { at, count, error? }
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { prisma } from "@/lib/prisma";

const KEY_CONFIG = "instagram.config";
const KEY_LAST_SYNC = "instagram.lastSync";

export type IgConfig = {
  accessToken: string;
  igUserId: string;
  /** Cached after the most recent successful verifyConnection() call. */
  username?: string;
  /** Cached profile picture URL (CDN, may rotate). */
  profilePictureUrl?: string;
  /** When we last refreshed (or first set) the long-lived token. */
  tokenIssuedAt?: string;
};

export type IgLastSync = {
  /** ISO timestamp of the last sync attempt (success or fail). */
  at: string;
  /** Number of items upserted on the last successful run. */
  count: number;
  /** Error message from the last failed run. Cleared on success. */
  error?: string;
  /** Whether the last attempt succeeded. */
  ok: boolean;
};

/** Read the Instagram config — null if Sofia hasn't set up yet. */
export async function readIgConfig(): Promise<IgConfig | null> {
  const row = await prisma.setting.findUnique({
    where: { key: KEY_CONFIG },
  });
  if (!row) return null;
  const v = row.valueJson as Partial<IgConfig> | null;
  if (!v?.accessToken || !v?.igUserId) return null;
  return {
    accessToken: v.accessToken,
    igUserId: v.igUserId,
    username: v.username,
    profilePictureUrl: v.profilePictureUrl,
    tokenIssuedAt: v.tokenIssuedAt,
  };
}

/**
 * Save (or replace) the Instagram config. Pass `null` to clear it
 * (e.g. when Sofia disconnects).
 */
export async function writeIgConfig(
  patch: Partial<IgConfig> | null,
  actorId?: string,
): Promise<void> {
  if (patch === null) {
    await prisma.setting.deleteMany({ where: { key: KEY_CONFIG } });
    return;
  }

  // Merge with existing so callers can update one field without
  // having to know the rest.
  const existing = (await readIgConfig()) ?? {};
  const merged = { ...existing, ...patch };

  await prisma.setting.upsert({
    where: { key: KEY_CONFIG },
    create: {
      key: KEY_CONFIG,
      valueJson: merged as object,
      updatedBy: actorId ?? null,
    },
    update: {
      valueJson: merged as object,
      updatedBy: actorId ?? null,
    },
  });
}

/** Read the last-sync metadata — null if no sync has ever run. */
export async function readLastSync(): Promise<IgLastSync | null> {
  const row = await prisma.setting.findUnique({
    where: { key: KEY_LAST_SYNC },
  });
  if (!row) return null;
  const v = row.valueJson as Partial<IgLastSync> | null;
  if (!v?.at) return null;
  return {
    at: v.at,
    count: v.count ?? 0,
    error: v.error,
    ok: v.ok ?? !v.error,
  };
}

/** Stamp the last-sync row. Call from sync.ts after each run. */
export async function writeLastSync(payload: IgLastSync): Promise<void> {
  await prisma.setting.upsert({
    where: { key: KEY_LAST_SYNC },
    create: {
      key: KEY_LAST_SYNC,
      valueJson: payload as object,
    },
    update: {
      valueJson: payload as object,
    },
  });
}
