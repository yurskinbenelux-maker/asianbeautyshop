// ─────────────────────────────────────────────────────────────────────────
// Google Merchant Center product feed — query layer.
//
// The XML route at /api/feeds/google-merchant.xml maps each row this
// function returns into one <item> tag. Google's Shopping crawler then
// fetches that URL on a schedule (daily by default, up to hourly on paid
// tiers) so adding/editing/archiving a product in admin propagates to
// Google Shopping without any manual upload.
//
// Why a dedicated query (not a re-use of getShopProducts):
//   · Different selection rules — we want EVERY published product
//     regardless of pagination / filters, in one batch
//   · Different field shape — Google needs flat scalar fields suitable
//     for XML serialisation (no Decimal, no Date, no HTML)
//   · We must skip GIFT_CARD kind — Google Shopping rejects gift cards
//     in most jurisdictions anyway
//   · We compute aggregate stock at the product level (sum across
//     variants) so a product with at least one variant in stock counts
//     as "in stock" for the feed
// ─────────────────────────────────────────────────────────────────────────

import {
  Locale,
  ProductStatus,
  ProductKind,
  MediaKind,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * One row in the Google feed = one <item> tag in the output XML.
 *
 * All fields are pre-resolved + serialisation-safe (no Decimal, no Date,
 * no HTML). The route is then just a string-template render.
 */
export type GoogleFeedProduct = {
  /** Stable per-product ID Google uses to track inventory across feeds.
   *  We use the SKU (human-friendly, never changes) instead of the
   *  UUID — Merchant Center reports get easier to read in admin. */
  id: string;
  /** Marketing title — EN product name. */
  title: string;
  /** Plain-text description, truncated to 5000 chars (Google's hard cap). */
  description: string;
  /** Absolute product URL (always points at the EN locale). */
  link: string;
  /** Primary product image, absolute HTTPS URL. Skipped if missing —
   *  Google rejects items without an image_link. */
  imageUrl: string | null;
  /** Up to 10 extra image URLs Google can rotate through in the carousel. */
  additionalImageUrls: string[];
  /** Display brand name. Required by Google for cosmetics. */
  brand: string;
  /** "29.99 EUR" — Google's required format for `g:price`. When the
   *  product is on sale, this carries the ORIGINAL price (so the
   *  customer sees a strikethrough in Shopping) and `salePrice` below
   *  carries the discounted price. When not on sale, salePrice is
   *  null and price is the actual paid price. */
  price: string;
  /** "24.99 EUR" — only set when isOnSale=true. */
  salePrice: string | null;
  /** "in_stock" | "out_of_stock". We don't use "preorder" anywhere. */
  availability: "in_stock" | "out_of_stock";
  /** Always "new" for our catalogue. */
  condition: "new";
  /** EAN-13 barcode if available. Skipped if not — combined with brand +
   *  MPN (SKU) Google still accepts the item. */
  gtin: string | null;
  /** Manufacturer Part Number — we use the SKU. Always present. */
  mpn: string;
  /** Google Product Taxonomy path — full string like
   *  "Health & Beauty > Personal Care > Cosmetics > Skin Care".
   *  Mapped from the product's category slug in `googleCategoryFor()`. */
  googleProductCategory: string;
};

/**
 * Pull every product that should appear in Google Shopping right now.
 *
 * Filters applied:
 *   · status = LIVE              (drafts/archived stay private)
 *   · kind   = STANDARD          (gift cards excluded — Google policy)
 *   · deletedAt = null           (soft-deleted rows hidden)
 *   · has EN translation         (no EN copy = no usable title/desc)
 *   · has at least one image     (Google rejects image-less items)
 *
 * `origin` is the absolute site URL ("https://asianbeautyshop.eu") used
 * to build product + image URLs. Always trim the trailing slash before
 * passing in.
 */
export async function getProductsForGoogleFeed(
  origin: string,
): Promise<GoogleFeedProduct[]> {
  const rows = await prisma.product.findMany({
    where: {
      // PUBLISHED is the DB-level "live" status — admin UI labels it
      // "Live" colloquially but the canonical enum value is PUBLISHED.
      status: ProductStatus.PUBLISHED,
      kind: ProductKind.STANDARD,
      deletedAt: null,
    },
    select: {
      id: true,
      sku: true,
      price: true,
      isOnSale: true,
      salePercent: true,
      barcode: true,
      brand: { select: { name: true } },
      translations: {
        where: { locale: Locale.EN },
        select: { name: true, slug: true, description: true, shortDescription: true },
      },
      media: {
        where: { kind: MediaKind.IMAGE },
        select: { url: true, isPrimary: true, sortOrder: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
      variants: {
        select: { stock: true, barcode: true, price: true },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
      },
      categories: {
        select: { category: { select: { slug: true, parent: { select: { slug: true } } } } },
      },
    },
  });

  const out: GoogleFeedProduct[] = [];

  for (const p of rows) {
    const en = p.translations[0];
    if (!en) continue; // No EN copy → skip (rare; we always have EN).

    const images = p.media.map((m) => m.url);
    if (images.length === 0) continue; // No image → Google rejects, skip.

    // Stock rollup: sum across variants. If the product has no
    // variants at all (legacy data) we assume in_stock — same rule the
    // PDP uses. Out-of-stock items still appear in the feed but with
    // availability=out_of_stock so Google can re-include them as soon
    // as we restock without our needing to re-add the SKU.
    const stockSum = p.variants.reduce((acc, v) => acc + (v.stock ?? 0), 0);
    const hasVariants = p.variants.length > 0;
    const inStock = hasVariants ? stockSum > 0 : true;

    // Sale-aware pricing. When isOnSale=true we ALWAYS emit both
    // `price` (= regular pre-sale price, becomes the strikethrough in
    // Shopping listings) AND `salePrice` (= discounted price the
    // customer actually pays). When not on sale, only `price` is set.
    const base = Math.round(Number(p.price) * 100) / 100;
    let priceStr: string;
    let saleStr: string | null;
    if (p.isOnSale && p.salePercent && p.salePercent > 0) {
      const pct = Math.min(90, Math.max(0, p.salePercent));
      const discounted = Math.round(base * (1 - pct / 100) * 100) / 100;
      priceStr = `${base.toFixed(2)} EUR`;
      saleStr = `${discounted.toFixed(2)} EUR`;
    } else {
      priceStr = `${base.toFixed(2)} EUR`;
      saleStr = null;
    }

    // Barcode rollup: prefer the product-level EAN, then the first
    // variant that has one (we only ship one barcode per SKU but a
    // multi-variant product might key it on the variant instead).
    const gtin =
      p.barcode?.trim() ||
      p.variants.find((v) => v.barcode && v.barcode.trim())?.barcode?.trim() ||
      null;

    out.push({
      id: p.sku, // SKU = human-readable & stable.
      title: clip(en.name, 150),
      description: stripHtmlAndTruncate(
        en.description || en.shortDescription || en.name,
        5000,
      ),
      link: `${origin}/en/shop/${en.slug}`,
      imageUrl: images[0],
      additionalImageUrls: images.slice(1, 11), // Google caps at 10.
      brand: p.brand?.name?.trim() || "Asian Beauty Shop",
      price: priceStr,
      salePrice: saleStr,
      availability: inStock ? "in_stock" : "out_of_stock",
      condition: "new",
      gtin,
      mpn: p.sku,
      googleProductCategory: googleCategoryFor(
        p.categories.map((c) => ({
          slug: c.category.slug,
          parentSlug: c.category.parent?.slug ?? null,
        })),
      ),
    });
  }

  return out;
}

// ────────── helpers ─────────────────────────────────────────────────────

/**
 * Map our category slugs to Google's Product Taxonomy paths. Google
 * accepts the full string path verbatim; we don't need their numeric
 * category IDs.
 *
 * https://support.google.com/merchants/answer/6324436
 *
 * The strategy: walk the product's category chain (specific → parent),
 * find the FIRST one that has a known mapping, and use that. Anything
 * that doesn't match falls back to the generic "Skin Care" bucket —
 * everything we sell is at minimum that, so the catch-all is correct.
 */
function googleCategoryFor(
  cats: { slug: string; parentSlug: string | null }[],
): string {
  // Walk specific → general so a product tagged "sunscreen" lands in
  // "Sun Care" rather than the broader "Skin Care" parent.
  for (const c of cats) {
    const hit = CATEGORY_MAP[c.slug];
    if (hit) return hit;
  }
  for (const c of cats) {
    if (!c.parentSlug) continue;
    const hit = CATEGORY_MAP[c.parentSlug];
    if (hit) return hit;
  }
  return DEFAULT_CATEGORY;
}

const DEFAULT_CATEGORY =
  "Health & Beauty > Personal Care > Cosmetics > Skin Care";

/**
 * Slug → Google taxonomy path. Add new mappings here as you create
 * new categories. Keys MUST match Category.slug values in the DB
 * (lowercase, hyphenated).
 *
 * Known taxonomy paths sourced from Google's public list — we keep
 * the human-readable string form rather than the numeric IDs because
 * Merchant Center accepts both and strings are easier to audit.
 */
const CATEGORY_MAP: Record<string, string> = {
  // Top-level buckets
  cleansers: "Health & Beauty > Personal Care > Cosmetics > Skin Care > Skin Cleansing Wipes",
  toners: "Health & Beauty > Personal Care > Cosmetics > Skin Care > Toners",
  serums: "Health & Beauty > Personal Care > Cosmetics > Skin Care > Anti-Aging Skin Care Kits",
  creams: "Health & Beauty > Personal Care > Cosmetics > Skin Care > Moisturizers",
  masks: "Health & Beauty > Personal Care > Cosmetics > Skin Care > Skin Care Masks & Peels",
  "face-masks": "Health & Beauty > Personal Care > Cosmetics > Skin Care > Skin Care Masks & Peels",
  peelings: "Health & Beauty > Personal Care > Cosmetics > Skin Care > Skin Care Masks & Peels",
  peeling: "Health & Beauty > Personal Care > Cosmetics > Skin Care > Skin Care Masks & Peels",
  spf: "Health & Beauty > Personal Care > Cosmetics > Skin Care > Sun Care",
  sunscreens: "Health & Beauty > Personal Care > Cosmetics > Skin Care > Sun Care",
  // Sub-cleansers
  "oil-cleansers": "Health & Beauty > Personal Care > Cosmetics > Skin Care",
  "cleansing-balms": "Health & Beauty > Personal Care > Cosmetics > Skin Care",
  "make-up-removers": "Health & Beauty > Personal Care > Cosmetics > Skin Care",
  "micellar-waters": "Health & Beauty > Personal Care > Cosmetics > Skin Care",
  "water-based-cleansers": "Health & Beauty > Personal Care > Cosmetics > Skin Care",
  // Sub-toners
  "exfoliating-toners": "Health & Beauty > Personal Care > Cosmetics > Skin Care > Toners",
  "calming-toners": "Health & Beauty > Personal Care > Cosmetics > Skin Care > Toners",
  "mist-toners": "Health & Beauty > Personal Care > Cosmetics > Skin Care > Toners",
  "toner-pads": "Health & Beauty > Personal Care > Cosmetics > Skin Care > Toners",
  "hydrating-toners": "Health & Beauty > Personal Care > Cosmetics > Skin Care > Toners",
};

function stripHtmlAndTruncate(html: string, maxChars: number): string {
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  const snapped = plain.slice(0, maxChars).replace(/\s+\S*$/, "");
  return `${snapped}…`;
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
