// ─────────────────────────────────────────────────────────────────────────
// `maybeRedirect(locale, relativePath)` — call this right before `notFound()`
// in a dynamic slug page. If a Redirect row exists for the reconstructed
// full path, issues a 301 / 302 via next/navigation.
//
// Why "relativePath"? The dynamic pages only know their own `[slug]` value,
// not the full pathname. We reconstruct "/{locale}/{relativePath}" here so
// callers don't have to remember the exact prefix shape.
// ─────────────────────────────────────────────────────────────────────────

import { permanentRedirect, redirect } from "next/navigation";
import { resolveRedirect, recordRedirectHit } from "./db";

/**
 * If the reconstructed path is mapped in the Redirect table, this THROWS
 * a Next.js redirect — the page render short-circuits with a 301/302.
 * Otherwise returns undefined and the caller continues to `notFound()`.
 *
 * The locale prefix is added for you; pass `relativePath` WITHOUT it.
 *
 * Example:
 *   // inside /app/[locale]/shop/[slug]/page.tsx
 *   await maybeRedirect(locale, `/shop/${slug}`);
 *   notFound();
 */
export async function maybeRedirect(
  locale: string,
  relativePath: string,
): Promise<void> {
  const full = `/${locale}${relativePath.startsWith("/") ? relativePath : `/${relativePath}`}`;
  const hit = await resolveRedirect(full);
  if (!hit) return;

  // Fire-and-forget hit counter. We intentionally do NOT await — the user
  // gets their 301 immediately; the counter update happens after.
  void recordRedirectHit(hit.id);

  if (hit.code === "PERMANENT") {
    permanentRedirect(hit.toPath);
  }
  redirect(hit.toPath);
}
