// ─────────────────────────────────────────────────────────────────────────
// ingredient-upsert.ts — auto-grow the master Ingredient library when
// products mention ingredients we haven't seen before.
//
// Two callers today:
//   1. CSV bulk import (admin/products/import/actions.ts) — feeds slugs
//      from the `ingredient_slugs` column.
//   2. Manual product editor (admin/products/actions.ts) — accepts a
//      free-text INCI list (comma-separated) on the Organise tab.
//
// Both want the same thing: take a list of ingredient names, ensure each
// exists in the Ingredient table, and return the slug→id map ready for
// ProductIngredient join writes.
//
// New rows get a stub English IngredientTranslation (displayName = inciName)
// so they show up correctly on the public /ingredients glossary and PDP
// breakdown immediately. an admin can later enrich the description + add
// other locales from /admin/ingredients.
// ─────────────────────────────────────────────────────────────────────────

import { Locale, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type IngredientSeed = {
  /** Slug-safe form (lowercase, hyphens). Used as the unique key. */
  slug: string;
  /** Human INCI form (e.g. "Hyaluronic Acid"). Stored on Ingredient.inciName
   *  and as the EN displayName on the stub translation. */
  inciName: string;
};

/**
 * Idempotent upsert. Existing rows are returned as-is (we never overwrite
 * inciName or translations — the admin may have refined them already).
 *
 * Returns a Map keyed by the slugs that were actually processed (anything
 * with an empty slug is skipped, so duplicates from bad input don't crash).
 */
export async function ensureIngredients(
  seeds: ReadonlyArray<IngredientSeed>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (seeds.length === 0) return map;

  // Dedupe by slug — caller may pass the same ingredient twice (e.g. once
  // from `ingredient_slugs` and again from a free-text textarea).
  const bySlug = new Map<string, IngredientSeed>();
  for (const s of seeds) {
    if (!s.slug) continue;
    if (!bySlug.has(s.slug)) bySlug.set(s.slug, s);
  }

  // Bulk-fetch existing rows so we don't hit the DB once per ingredient
  // on a 200-row import.
  const slugs = Array.from(bySlug.keys());
  if (slugs.length === 0) return map;

  const existing = await prisma.ingredient.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  for (const e of existing) {
    map.set(e.slug, e.id);
    bySlug.delete(e.slug); // remaining entries in bySlug need creation
  }

  // Create stubs for the rest. We do these one at a time (not createMany
  // with skipDuplicates) because we need to also create the EN translation
  // in the same write — and createMany doesn't support nested creates.
  for (const seed of bySlug.values()) {
    try {
      const created = await prisma.ingredient.create({
        data: {
          slug: seed.slug,
          inciName: seed.inciName || seed.slug,
          translations: {
            create: [
              {
                locale: Locale.EN,
                displayName: seed.inciName || seed.slug,
              },
            ],
          },
        },
        select: { id: true, slug: true },
      });
      map.set(created.slug, created.id);
    } catch (err) {
      // Race: another concurrent request created the same slug between
      // our findMany and create. Re-fetch and pick up the existing row.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const fallback = await prisma.ingredient.findUnique({
          where: { slug: seed.slug },
          select: { id: true },
        });
        if (fallback) {
          map.set(seed.slug, fallback.id);
          continue;
        }
      }
      throw err;
    }
  }

  return map;
}

/** Title-case a slug back into a display name.
 *  "hyaluronic-acid" → "Hyaluronic Acid".
 *
 *  Imperfect for INCI's mixed-case quirks (e.g. "Centella Asiatica" vs
 *  "1,2-Hexanediol"), but it gives the auto-created stub a recognisable
 *  display name. The admin can fix the casing on /admin/ingredients later. */
export function deslugifyToTitle(slug: string): string {
  return slug
    .split("-")
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

/** Parse a free-text INCI declaration into a list of (slug, inciName)
 *  seeds suitable for ensureIngredients(). Splits on commas and semicolons
 *  (admins paste either format), trims, drops empties, slugifies.
 *
 *  Note: real INCI parsing is hard — names like "Caprylyl/Capryl Glucoside"
 *  or "1,2-Hexanediol" can confuse a naïve splitter. We accept that
 *  imperfection here; the worst case is a compound name lands as two stubs
 *  that an admin merges later. The alternative (require a structured field)
 *  would be much worse for her workflow.
 */
export function parseInciTextarea(raw: string): IngredientSeed[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((name) => ({
      slug: slugifyForIngredient(name),
      inciName: name,
    }))
    .filter((s) => s.slug.length > 0);
}

/** Slugifier matching the project-wide rule (mirrors the one in
 *  admin/products/actions.ts and lib/admin/product-csv.ts). Kept private
 *  so this module is self-contained. */
function slugifyForIngredient(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}
