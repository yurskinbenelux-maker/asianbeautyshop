// ─────────────────────────────────────────────────────────────────────────
// Data-layer for admin-editable URL redirects.
//
// Used in two places:
//
//   1. Public slug pages — call `resolveRedirect(pathname)` before
//      `notFound()` so a renamed product/category/brand still lands its
//      visitors on the right URL with a 301.
//
//   2. Admin (/admin/redirects) — full CRUD list + forms. See
//      `listAdminRedirects`, `getRedirect`, and the server actions in
//      /src/app/admin/redirects/actions.ts.
//
// We deliberately keep paths LOCALE-PREFIXED (e.g. "/en/shop/old-slug") so
// a rename only affects the specific locale translation that changed —
// French can stay stable while English gets a new slug.
// ─────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/prisma";
import type { RedirectCode } from "@prisma/client";

/** Normalise a path for comparison: trim trailing slash, ensure leading `/`. */
export function normalisePath(input: string): string {
  let p = (input ?? "").trim();
  if (!p) return "/";
  if (!p.startsWith("/")) p = `/${p}`;
  // Strip trailing slash EXCEPT for the bare "/" root.
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export type ResolvedRedirect = {
  id: string;
  toPath: string;
  code: RedirectCode;
};

/**
 * Look up a single redirect for the given path. Returns null if none exists.
 * Uses the unique index on fromPath — one indexed lookup, no scan.
 */
export async function resolveRedirect(
  pathname: string,
): Promise<ResolvedRedirect | null> {
  const fromPath = normalisePath(pathname);
  const row = await prisma.redirect.findUnique({
    where: { fromPath },
    select: { id: true, toPath: true, code: true },
  });
  return row;
}

/**
 * Fire-and-forget hit counter. We don't await in the page render path —
 * the caller schedules this after issuing the redirect response.
 */
export async function recordRedirectHit(id: string): Promise<void> {
  try {
    await prisma.redirect.update({
      where: { id },
      data: {
        hits: { increment: 1 },
        lastHitAt: new Date(),
      },
    });
  } catch {
    // Swallow — counter is advisory, never a user-visible concern.
  }
}

// ──────── admin list ────────────────────────────────────────────────────

export type AdminRedirectRow = {
  id: string;
  fromPath: string;
  toPath: string;
  code: RedirectCode;
  source: string | null;
  note: string | null;
  hits: number;
  lastHitAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listAdminRedirects(opts?: {
  q?: string;
}): Promise<AdminRedirectRow[]> {
  const q = (opts?.q ?? "").trim();
  const where = q
    ? {
        OR: [
          { fromPath: { contains: q, mode: "insensitive" as const } },
          { toPath: { contains: q, mode: "insensitive" as const } },
          { note: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  return prisma.redirect.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
  });
}

export async function getAdminRedirect(
  id: string,
): Promise<AdminRedirectRow | null> {
  return prisma.redirect.findUnique({ where: { id } });
}

// ──────── auto-insert (slug change hook) ────────────────────────────────

/**
 * Insert (or refresh) a redirect row when a slug changes. Use this from
 * product/category/brand/journal translation update actions — fire-and-
 * forget; if the row already exists we overwrite the target so chains
 * collapse ("/old → /mid → /new" becomes "/old → /new").
 *
 * No-ops if fromPath === toPath (the admin just re-saved without changing).
 */
export async function upsertAutoRedirect(args: {
  fromPath: string;
  toPath: string;
  source: string; // e.g. "auto:product-slug"
}): Promise<void> {
  const fromPath = normalisePath(args.fromPath);
  const toPath = normalisePath(args.toPath);
  if (!fromPath || !toPath || fromPath === toPath) return;

  // Before creating "/a → /b", if a redirect "/x → /a" already exists,
  // collapse it to "/x → /b" so we never produce a chain.
  await prisma.redirect.updateMany({
    where: { toPath: fromPath },
    data: { toPath },
  });

  await prisma.redirect.upsert({
    where: { fromPath },
    create: {
      fromPath,
      toPath,
      code: "PERMANENT",
      source: args.source,
    },
    update: {
      toPath,
      code: "PERMANENT",
      // Keep note + manual edits — only bump the timestamp.
      updatedAt: new Date(),
    },
  });
}
