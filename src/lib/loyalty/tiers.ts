// ─────────────────────────────────────────────────────────────────────────
// Tier ladder — read the LoyaltyTier rows + compute current/next/progress.
//
// First-touch: lazy-seeds the default ladder on first read so the drawer
// has something to render before Sofia opens /admin/loyalty/tiers.
// Defaults are peony-lifecycle-themed (Bud / Bloom / Aurora / Atelier);
// Sofia can rename or replace via the admin CRUD (Phase C).
// ─────────────────────────────────────────────────────────────────────────

import "server-only";

import { prisma } from "@/lib/prisma";
import type { LoyaltyTier } from "@prisma/client";

/** The starter ladder. Sofia can rewrite these any time from
 *  /admin/loyalty/tiers — these are just opinionated defaults so a fresh
 *  install isn't an empty drawer. Threshold = lifetime points needed. */
export const DEFAULT_TIERS = [
  { name: "Bud",     pointsThreshold: 0,    sortOrder: 0 },
  { name: "Bloom",   pointsThreshold: 500,  sortOrder: 1 },
  { name: "Aurora",  pointsThreshold: 2000, sortOrder: 2 },
  { name: "Atelier", pointsThreshold: 5000, sortOrder: 3 },
] as const;

/** Read the active tier ladder, sorted ascending by threshold. Lazily
 *  seeds DEFAULT_TIERS on first call. Tolerant of races: createMany with
 *  skipDuplicates means concurrent first-touches converge on the same
 *  set without throwing. */
export async function getLoyaltyTiers(): Promise<LoyaltyTier[]> {
  const existing = await prisma.loyaltyTier.findMany({
    where: { isActive: true },
    orderBy: [{ pointsThreshold: "asc" }, { sortOrder: "asc" }],
  });
  if (existing.length > 0) return existing;

  // Seed defaults — only one of these will actually win the insert if
  // two requests race; we re-read so both branches return the same set.
  await prisma.loyaltyTier.createMany({
    data: DEFAULT_TIERS.map((t) => ({ ...t })),
    skipDuplicates: true,
  });

  return prisma.loyaltyTier.findMany({
    where: { isActive: true },
    orderBy: [{ pointsThreshold: "asc" }, { sortOrder: "asc" }],
  });
}

// ────────── tier resolution ──────────────────────────────────────────────

export type ResolvedTier = {
  /** Tier the customer currently holds. Always present — fallbacks to
   *  the lowest-threshold tier (which should be at threshold 0). */
  current: LoyaltyTier;
  /** Tier they're working toward. Null when they're already at the top. */
  next: LoyaltyTier | null;
  /** 0..1 progress toward `next`. 1 when at top tier. */
  progress: number;
  /** Points still needed to hit `next`. 0 when at top. */
  pointsToNext: number;
};

/** Given a customer's lifetime points, work out where they sit on the
 *  ladder. Pass in the cached `getLoyaltyTiers()` result so we don't
 *  re-query inside hot loops. */
export function resolveTier(
  pointsLifetime: number,
  tiers: LoyaltyTier[],
): ResolvedTier {
  if (tiers.length === 0) {
    // Defensive fallback — shouldn't happen because getLoyaltyTiers seeds
    // defaults, but the type system can't prove that.
    const placeholder: LoyaltyTier = {
      id: "placeholder",
      name: "Member",
      pointsThreshold: 0,
      iconKey: null,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return {
      current: placeholder,
      next: null,
      progress: 1,
      pointsToNext: 0,
    };
  }

  // Walk from top down — first tier whose threshold ≤ lifetime is theirs.
  const sorted = [...tiers].sort((a, b) => b.pointsThreshold - a.pointsThreshold);
  const current =
    sorted.find((t) => pointsLifetime >= t.pointsThreshold) ??
    sorted[sorted.length - 1];

  // Next tier = first one with a strictly higher threshold.
  const ascending = [...tiers].sort(
    (a, b) => a.pointsThreshold - b.pointsThreshold,
  );
  const next =
    ascending.find((t) => t.pointsThreshold > current.pointsThreshold) ?? null;

  if (!next) {
    return { current, next: null, progress: 1, pointsToNext: 0 };
  }

  const span = next.pointsThreshold - current.pointsThreshold;
  const earned = Math.max(0, pointsLifetime - current.pointsThreshold);
  const progress = span > 0 ? Math.min(1, earned / span) : 1;
  const pointsToNext = Math.max(0, next.pointsThreshold - pointsLifetime);

  return { current, next, progress, pointsToNext };
}
