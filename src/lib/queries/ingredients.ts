// ─────────────────────────────────────────────────────────────────────────
// Ingredient queries — used by the public /ingredients index + detail
// pages. Two shapes:
//
//   · listActiveIngredients — lightweight A-Z listing (slug, display
//     name, INCI name, key-asset flag, count of published products
//     using it). Used on /ingredients.
//
//   · getIngredientBySlug — full detail (display name, description HTML,
//     INCI, allergen/key-asset flags, list of products using it with
//     image + price). Used on /ingredients/[slug].
//
// Both honour the locale → EN fallback pattern used across the rest of
// the queries layer, so an ingredient with only an EN translation still
// renders on /nl/ingredients/<slug>.
// ─────────────────────────────────────────────────────────────────────────

import { Locale, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function toPrismaLocale(urlLocale: string): Locale {
  switch (urlLocale.toLowerCase()) {
    case "nl":
      return Locale.NL;
    case "fr":
      return Locale.FR;
    case "ru":
      return Locale.RU;
    default:
      return Locale.EN;
  }
}

// ─── sitemap helper ─────────────────────────────────────────────────────
//
// Returns slug + updatedAt for every ingredient that has at least one
// published, non-deleted product using it. Sitemap entries use the
// per-row updatedAt so admin edits propagate at the next crawl.
//
// We don't filter on translations here — if the row exists, it has at
// minimum the EN translation (admin enforces it). Locale variants are
// rendered with the EN fallback when missing, mirroring the PDP pattern.

export type IngredientSlugRow = { slug: string; updatedAt: Date };

export async function getAllSitemapIngredientSlugs(): Promise<
  IngredientSlugRow[]
> {
  // Only surface ingredients that actually have published products
  // attached — listing orphan ingredients in the sitemap would only
  // dilute Google's crawl budget on a small site.
  const rows = await prisma.ingredient.findMany({
    where: {
      productLinks: {
        some: {
          product: { status: ProductStatus.PUBLISHED, deletedAt: null },
        },
      },
    },
    select: { slug: true, updatedAt: true },
    orderBy: { inciName: "asc" },
  });
  return rows;
}

// ─── list ───────────────────────────────────────────────────────────────

export type IngredientListRow = {
  slug: string;
  inciName: string;
  displayName: string;
  shortDescription: string | null;
  isKeyAsset: boolean;
  productCount: number;
};

export async function listActiveIngredients(
  locale: string,
): Promise<IngredientListRow[]> {
  const loc = toPrismaLocale(locale);

  const rows = await prisma.ingredient.findMany({
    orderBy: [{ isKeyAsset: "desc" }, { inciName: "asc" }],
    include: {
      translations: { where: { locale: { in: [loc, Locale.EN] } } },
      _count: {
        select: {
          productLinks: {
            where: {
              product: {
                status: ProductStatus.PUBLISHED,
                deletedAt: null,
              },
            },
          },
        },
      },
    },
  });

  return rows.map((r) => {
    const tr =
      r.translations.find((t) => t.locale === loc) ??
      r.translations.find((t) => t.locale === Locale.EN);
    // For the list we strip HTML from the description and take the
    // first ~160 chars so the grid stays visually tidy. Full HTML is
    // preserved for the detail page.
    const shortDescription = tr?.description
      ? stripHtmlAndTruncate(tr.description, 160)
      : null;
    return {
      slug: r.slug,
      inciName: r.inciName,
      displayName: tr?.displayName ?? r.inciName,
      shortDescription,
      isKeyAsset: r.isKeyAsset,
      productCount: r._count.productLinks,
    };
  });
}

// ─── detail ─────────────────────────────────────────────────────────────

export type IngredientProduct = {
  slug: string;
  name: string;
  imageUrl: string | null;
  priceEur: number;
  isKey: boolean; // was this ingredient marked as a key asset on the product
};

export type IngredientDetail = {
  slug: string;
  inciName: string;
  displayName: string;
  descriptionHtml: string | null;
  isKeyAsset: boolean;
  isAllergen: boolean;
  isFallback: boolean; // true when we had to render the EN translation
  products: IngredientProduct[];
};

export async function getIngredientBySlug({
  slug,
  locale,
}: {
  slug: string;
  locale: string;
}): Promise<IngredientDetail | null> {
  const loc = toPrismaLocale(locale);

  const ing = await prisma.ingredient.findUnique({
    where: { slug },
    include: {
      translations: { where: { locale: { in: [loc, Locale.EN] } } },
      productLinks: {
        where: {
          product: {
            status: ProductStatus.PUBLISHED,
            deletedAt: null,
          },
        },
        include: {
          product: {
            include: {
              translations: { where: { locale: { in: [loc, Locale.EN] } } },
              // Product images live on the Media relation (kind=IMAGE).
              // We only need the primary / first-in-sortOrder shot for
              // the ingredient page thumbnail — one row per product.
              media: {
                where: { kind: "IMAGE" },
                orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!ing) return null;

  const requested = ing.translations.find((t) => t.locale === loc);
  const fallback = ing.translations.find((t) => t.locale === Locale.EN);
  const chosen = requested ?? fallback;

  const products: IngredientProduct[] = ing.productLinks
    .map((link) => {
      const p = link.product;
      // Per-locale slug and name both live on ProductTranslation; the
      // Product table itself only has `sku`. If the requested locale
      // is missing we fall back to the EN translation.
      const tr =
        p.translations.find((t) => t.locale === loc) ??
        p.translations.find((t) => t.locale === Locale.EN);
      return {
        slug: tr?.slug ?? p.sku.toLowerCase(),
        name: tr?.name ?? p.sku,
        imageUrl: p.media[0]?.url ?? null,
        // Product.price is a Prisma Decimal — coerce to a plain number
        // for the view model. Prices are stored in EUR directly.
        priceEur: Number(p.price),
        isKey: link.isKey,
      };
    })
    // Key-asset appearances first, then alphabetical — keeps the hero
    // products near the top of the list.
    .sort((a, b) => {
      if (a.isKey !== b.isKey) return a.isKey ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return {
    slug: ing.slug,
    inciName: ing.inciName,
    displayName: chosen?.displayName ?? ing.inciName,
    descriptionHtml: chosen?.description ?? null,
    isKeyAsset: ing.isKeyAsset,
    isAllergen: ing.isAllergen,
    isFallback: !requested && !!fallback,
    products,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────

function stripHtmlAndTruncate(html: string, maxChars: number): string {
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  // Snap to the last word boundary to avoid mid-word truncation.
  const snapped = plain.slice(0, maxChars).replace(/\s+\S*$/, "");
  return `${snapped}…`;
}
