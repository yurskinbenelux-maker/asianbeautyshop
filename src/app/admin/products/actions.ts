// ─────────────────────────────────────────────────────────────────────────
// Server Actions for /admin/products.
//
// Every mutation in the product editor flows through this file. Rules:
//   • every action calls requireAdmin() first — defence in depth, even
//     though the layout already guards the route
//   • inputs are parsed with Zod so we never trust FormData shapes
//   • on success we revalidatePath() so both the admin view and the
//     public shop pages pick up the change without a cache bust
//   • prices are strings in the form (users type "24.90") and we let
//     Prisma Decimal coerce — do NOT parseFloat (floating point is
//     exactly the wrong thing for money)
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AudienceCategory,
  Locale,
  MediaKind,
  Prisma,
  ProductStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_LINES } from "@/lib/queries/products";
import {
  PRODUCT_MEDIA_BUCKET,
  supabaseAdmin,
} from "@/lib/supabase/admin";
import { upsertAutoRedirect } from "@/lib/redirects/db";
import { applyMovement } from "@/lib/inventory/movements";
import { logAudit } from "@/lib/audit/log";
import {
  ensureIngredients,
  parseInciTextarea,
} from "@/lib/admin/ingredient-upsert";
import {
  suggestTagsForProduct,
  type SuggestTagsOutput,
} from "@/lib/ai/suggest-tags";
import {
  polishProductText,
  type PolishableField,
  type PolishOutput,
} from "@/lib/ai/polish-text";

// ──────── helpers ────────────────────────────────────────────────────────

/** A slug-safe string: lowercase, hyphens, alphanumerics only. */
function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

/** Generate a unique-ish SKU from a seed. Admin can rename later. */
function draftSku() {
  // "DRAFT-9F2K" — short, unique enough, obvious it's a placeholder.
  return `DRAFT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * Accept "24.90" / "24,90" / "" and return a Prisma.Decimal or null.
 * `""` is treated as "not set" so comparePrice clears cleanly.
 */
function parseMoney(raw: FormDataEntryValue | null): Prisma.Decimal | null {
  if (raw === null) return null;
  const s = String(raw).trim().replace(",", ".");
  if (s === "") return null;
  // Decimal throws on junk — let it propagate so Zod can report.
  return new Prisma.Decimal(s);
}

// ──────── create ─────────────────────────────────────────────────────────

/**
 * Creates a blank DRAFT product and redirects straight to its edit page.
 * No form: the admin just clicks "New product" and we drop them into
 * the editor with sensible defaults they can overwrite.
 */
export async function createProduct() {
  await requireAdmin();

  const sku = draftSku();
  const nameDraft = "Untitled product";
  const slug = slugify(`${nameDraft}-${sku}`);

  const product = await prisma.product.create({
    data: {
      sku,
      status: ProductStatus.DRAFT,
      price: new Prisma.Decimal("0.00"),
      translations: {
        // EN is mandatory — everything falls back to it on the public site.
        create: {
          locale: Locale.EN,
          name: nameDraft,
          slug,
          description: "<p>Describe this product.</p>",
        },
      },
    },
    select: { id: true },
  });

  revalidatePath("/admin/products");
  redirect(`/admin/products/${product.id}`);
}

// ──────── basics tab ─────────────────────────────────────────────────────

// Reusable transformer: blank string → null, otherwise parsed positive integer.
// Reused for volume / weight / shelf-life so the error messages stay consistent.
const PositiveIntOrEmpty = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), {
    message: "Must be a positive whole number",
  });

// Reusable: blank string → null, otherwise the trimmed value.
const TrimOrNull = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

const BasicsSchema = z.object({
  sku: z.string().min(1, "SKU is required").max(64),
  status: z.nativeEnum(ProductStatus),
  isFeatured: z.coerce.boolean(),
  isBestseller: z.coerce.boolean(),
  isAvailableForAi: z.coerce.boolean(),
  hideFromSearch: z.coerce.boolean(),
  // Sale flags — toggle + percent. Percent is optional but clamped 1-90
  // when set. The cart and storefront read isOnSale && salePercent>0
  // to decide whether to apply the markdown.
  isOnSale: z.coerce.boolean(),
  salePercent: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 1 && v <= 90),
      { message: "Sale % must be 1-90" },
    ),
  volumeMl: PositiveIntOrEmpty,
  weightGrams: PositiveIntOrEmpty,

  // ─── Supplier-spec fields (xlsx → DB round-trip) ─────────────────────
  productLine: TrimOrNull,
  // Barcode is normalised to digits only (UPC/EAN/GTIN). Blank stays null.
  // We don't strictly enforce length here — the importer already does, and
  // an admin editing one product is allowed to fix legacy data.
  barcode: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.replace(/\D+/g, "") || null))
    .refine((v) => v === null || (v.length >= 8 && v.length <= 14), {
      message: "Barcode must be 8–14 digits (UPC / EAN / GTIN)",
    }),
  shelfLifeMonths: PositiveIntOrEmpty,
  // ISO-3166 alpha-2. Uppercased on save. Empty allowed for unknown origin.
  originCountry: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.toUpperCase()))
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), {
      message: "Use the ISO-3166 alpha-2 code (e.g. KR, JP, FR)",
    }),
  hsCode: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.replace(/\D+/g, "") || null))
    .refine((v) => v === null || (v.length >= 4 && v.length <= 14), {
      message: "HS code must be 4–14 digits",
    }),
  audienceCategory: z.nativeEnum(AudienceCategory),
  inciList: TrimOrNull,
});

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const OK: ActionState = { ok: true, message: "Saved." };

/** Save the Basics tab (everything on Product except translations & relations). */
export async function updateBasics(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = BasicsSchema.safeParse({
    sku: formData.get("sku"),
    status: formData.get("status"),
    isFeatured: formData.get("isFeatured") === "on",
    isBestseller: formData.get("isBestseller") === "on",
    isAvailableForAi: formData.get("isAvailableForAi") === "on",
    hideFromSearch: formData.get("hideFromSearch") === "on",
    isOnSale: formData.get("isOnSale") === "on",
    salePercent: formData.get("salePercent") ?? "",
    volumeMl: formData.get("volumeMl") ?? "",
    weightGrams: formData.get("weightGrams") ?? "",
    productLine: formData.get("productLine") ?? "",
    barcode: formData.get("barcode") ?? "",
    shelfLifeMonths: formData.get("shelfLifeMonths") ?? "",
    originCountry: formData.get("originCountry") ?? "",
    hsCode: formData.get("hsCode") ?? "",
    audienceCategory: formData.get("audienceCategory") ?? AudienceCategory.UNISEX,
    inciList: formData.get("inciList") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let price: Prisma.Decimal;
  let comparePrice: Prisma.Decimal | null;
  try {
    const p = parseMoney(formData.get("price"));
    if (p === null) {
      return { ok: false, message: "Price is required." };
    }
    price = p;
    comparePrice = parseMoney(formData.get("comparePrice"));
  } catch {
    return { ok: false, message: "Prices must be numbers (e.g. 24.90)." };
  }

  try {
    await prisma.product.update({
      where: { id: productId },
      data: {
        ...parsed.data,
        price,
        comparePrice,
      },
    });
  } catch (err) {
    // Most common: unique SKU clash.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        message: "That SKU is already in use. Pick a different one.",
        fieldErrors: { sku: ["Already in use"] },
      };
    }
    throw err;
  }

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/", "layout"); // public shop may show this product
  return OK;
}

// ──────── translations tab ───────────────────────────────────────────────

const TranslationSchema = z.object({
  locale: z.nativeEnum(Locale),
  name: z.string().trim().min(1, "Name is required").max(200),
  slug: z.string().trim().min(1, "Slug is required").max(120),
  shortDescription: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
  description: z.string().min(1, "Description is required"),
  howToUse: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
  // Per-locale safety / regulatory copy. Plain text or simple HTML.
  warnings: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
  seoTitle: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
  seoDescription: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
});

/**
 * Upsert one locale's translation. We run one action per tab panel
 * rather than a single giant form — shorter diffs, less to redo on error.
 */
export async function updateTranslation(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = TranslationSchema.safeParse({
    locale: formData.get("locale"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    shortDescription: formData.get("shortDescription") ?? "",
    description: formData.get("description"),
    howToUse: formData.get("howToUse") ?? "",
    warnings: formData.get("warnings") ?? "",
    seoTitle: formData.get("seoTitle") ?? "",
    seoDescription: formData.get("seoDescription") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { locale, slug, ...rest } = parsed.data;
  const normalisedSlug = slugify(slug);
  if (!normalisedSlug) {
    return { ok: false, fieldErrors: { slug: ["Slug is required"] } };
  }

  // Capture the previous slug BEFORE the upsert so we can auto-insert a
  // redirect if Sofia is renaming (not creating) the translation.
  const prior = await prisma.productTranslation.findUnique({
    where: { productId_locale: { productId, locale } },
    select: { slug: true },
  });

  try {
    await prisma.productTranslation.upsert({
      where: { productId_locale: { productId, locale } },
      create: { productId, locale, slug: normalisedSlug, ...rest },
      update: { slug: normalisedSlug, ...rest },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        message: "That slug is already used by another product in this locale.",
        fieldErrors: { slug: ["Already in use"] },
      };
    }
    throw err;
  }

  // If the slug changed, drop a 301 so the old URL still lands its visitor
  // on the renamed product. Fire-and-forget — failure shouldn't block the
  // save; the admin can add a manual redirect from /admin/redirects later.
  if (prior && prior.slug !== normalisedSlug) {
    const localeSeg = locale.toLowerCase();
    try {
      await upsertAutoRedirect({
        fromPath: `/${localeSeg}/shop/${prior.slug}`,
        toPath: `/${localeSeg}/shop/${normalisedSlug}`,
        source: "auto:product-slug",
      });
    } catch {
      // Intentional — logged elsewhere if a central logger exists.
    }
  }

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/", "layout");
  return OK;
}

// ──────── duplicate ──────────────────────────────────────────────────────
//
//  "Duplicate product" — biggest daily time-saver Sofia asked for.
//
//  When she's adding a new serum from the same line as an existing one, the
//  pattern is: copy the existing product, edit the 2-3 fields that differ,
//  swap a couple of photos, publish. Without this button that's 10 minutes
//  of re-entering the same text in four locales.
//
//  What we copy (and what we deliberately don't):
//    ✓ all base fields (brand, price, flags, dimensions…)
//    ✓ all translations (name → "... (copy)", slug gets "-copy" suffix
//      with collision handling per locale)
//    ✓ all media rows (pointing at the SAME Supabase objects — storage is
//      immutable and we save bandwidth; Sofia replaces images in the
//      editor if she wants to)
//    ✓ all taxonomy links: categories, skin types, concerns, benefits,
//      ingredients
//    ✓ all variants (stock reset to 0, SKU gets a "-COPY" suffix with
//      collision handling)
//    ✓ all ritual steps and their per-locale translations
//    ✗ reviews — belong to the original product only
//    ✗ relatedFrom / relatedTo — related sections are hand-curated; the
//      copy gets a clean slate
//    ✗ isFeatured / isBestseller — conservative: don't auto-promote a copy
//    ✗ launchedAt — reset, the copy hasn't launched
//
//  We always land on the editor in Basics tab so Sofia can start editing
//  immediately.
// ─────────────────────────────────────────────────────────────────────────

/** Short DRAFT-prefixed SKU that doesn't clash with an existing product. */
async function uniqueProductSku(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = draftSku();
    const clash = await prisma.product.findUnique({
      where: { sku: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  // Astronomically unlikely with 36^4 = ~1.7M possible suffixes, but fail
  // loud rather than keep looping.
  throw new Error("Could not generate a unique product SKU after 5 attempts");
}

/** "{srcSku}-COPY" with numeric suffixes until no variant has that SKU. */
async function uniqueVariantSku(sourceSku: string): Promise<string> {
  const base = `${sourceSku.slice(0, 48)}-COPY`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await prisma.productVariant.findUnique({
      where: { sku: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  // Fall back to randomness — very unlikely to hit.
  return `${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * Produce a translation slug that doesn't clash within its locale.
 * Uniqueness is per-locale (see the @@unique([locale, slug]) on
 * ProductTranslation) so FR can reuse EN's slug — we only need to check
 * the same locale.
 */
async function uniqueTranslationSlug(
  locale: Locale,
  base: string,
): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await prisma.productTranslation.findFirst({
      where: { locale, slug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Clone a product and drop Sofia into the editor.
 *
 * Called as a Server Action — expects FormData with `productId`. Returning
 * via redirect() is what a Server Action is supposed to do, so we don't
 * need ActionState here; errors bubble up to Next's default error UI.
 */
export async function duplicateProduct(formData: FormData) {
  await requireAdmin();

  const productId = String(formData.get("productId") ?? "").trim();
  if (!productId) {
    // Defensive — should never happen from our own UI.
    redirect("/admin/products");
  }

  const source = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    include: {
      translations: true,
      variants: true,
      categories: true,
      skinTypes: true,
      concerns: true,
      benefits: true,
      ingredients: true,
      media: true,
      ritualSteps: { include: { translations: true } },
    },
  });
  if (!source) {
    // Nothing we can duplicate — just bounce back to the list.
    redirect("/admin/products");
  }

  const newSku = await uniqueProductSku();

  // Compute unique slugs up front so we can feed the full shape to a single
  // create() call below.
  const newTranslations = await Promise.all(
    source.translations.map(async (t) => {
      const slugBase = slugify(`${t.slug}-copy`) || slugify(`${t.name}-copy`) ||
        `copy-${Math.random().toString(36).slice(2, 6)}`;
      return {
        locale: t.locale,
        name: `${t.name} (copy)`,
        slug: await uniqueTranslationSlug(t.locale, slugBase),
        shortDescription: t.shortDescription,
        description: t.description,
        howToUse: t.howToUse,
        seoTitle: t.seoTitle,
        seoDescription: t.seoDescription,
      };
    }),
  );

  // Variant SKUs need uniqueness too. Different source variants have
  // different SKUs so Promise.all is safe (no two parallel lookups race
  // on the same candidate).
  const newVariants = await Promise.all(
    source.variants.map(async (v) => ({
      sku: await uniqueVariantSku(v.sku),
      label: v.label,
      price: v.price,
      comparePrice: v.comparePrice,
      stock: 0, // the copy has no inventory until Sofia receives the new SKU
      isDefault: v.isDefault,
      sortOrder: v.sortOrder,
      weightGrams: v.weightGrams,
      barcode: v.barcode,
    })),
  );

  const created = await prisma.product.create({
    data: {
      sku: newSku,
      brandId: source.brandId,
      status: ProductStatus.DRAFT, // always DRAFT — explicit safety rail
      isFeatured: false,
      isBestseller: false,
      isAvailableForAi: source.isAvailableForAi,
      hideFromSearch: source.hideFromSearch,
      price: source.price,
      comparePrice: source.comparePrice,
      cost: source.cost,
      weightGrams: source.weightGrams,
      volumeMl: source.volumeMl,
      launchedAt: null,
      translations: { create: newTranslations },
      categories: {
        create: source.categories.map((r) => ({ categoryId: r.categoryId })),
      },
      skinTypes: {
        create: source.skinTypes.map((r) => ({ skinTypeId: r.skinTypeId })),
      },
      concerns: {
        create: source.concerns.map((r) => ({ concernId: r.concernId })),
      },
      benefits: {
        create: source.benefits.map((r) => ({ benefitId: r.benefitId })),
      },
      ingredients: {
        create: source.ingredients.map((r) => ({
          ingredientId: r.ingredientId,
        })),
      },
      media: {
        // Storage objects are immutable — safe to reference the same URL
        // from two products. Replacing a photo on the copy uploads a fresh
        // object and points only the copy at it.
        create: source.media.map((m) => ({
          kind: m.kind,
          url: m.url,
          alt: m.alt,
          width: m.width,
          height: m.height,
          isPrimary: m.isPrimary,
          sortOrder: m.sortOrder,
        })),
      },
      ritualSteps: {
        create: source.ritualSteps.map((s) => ({
          stepNumber: s.stepNumber,
          timeOfDay: s.timeOfDay,
          translations: {
            create: s.translations.map((t) => ({
              locale: t.locale,
              title: t.title,
              body: t.body,
            })),
          },
        })),
      },
      variants: { create: newVariants },
    },
    select: { id: true },
  });

  revalidatePath("/admin/products");
  redirect(`/admin/products/${created.id}?tab=basics`);
}

// ──────── bulk publish ──────────────────────────────────────────────────
//
// One-click "publish all drafts" for the post-CSV-import flow. After Sofia
// imports 35 supplier products and sets prices, she shouldn't have to open
// each PDP and flip status to PUBLISHED. One button does the lot.
//
// Safety: skips any draft whose price is €0.00 — that's the import default
// and going live at €0 lets customers buy for free. The action surfaces
// the skipped count via a redirect query param so the UI can show "X
// products skipped — set prices first" without a separate flash mechanism.
// ─────────────────────────────────────────────────────────────────────────

export async function bulkPublishDraftsAction() {
  const actor = await requireAdmin();

  // Count + collect first so we can audit-log the count and report skips.
  const eligible = await prisma.product.findMany({
    where: {
      status: ProductStatus.DRAFT,
      deletedAt: null,
      // Decimal column: > 0 enforced via Prisma's numeric comparator.
      price: { gt: new Prisma.Decimal("0") },
    },
    select: { id: true, sku: true },
  });

  const skippedCount = await prisma.product.count({
    where: {
      status: ProductStatus.DRAFT,
      deletedAt: null,
      price: { lte: new Prisma.Decimal("0") },
    },
  });

  if (eligible.length === 0) {
    redirect(`/admin/products?status=DRAFT&publishedNone=1&skipped=${skippedCount}`);
  }

  await prisma.product.updateMany({
    where: { id: { in: eligible.map((p) => p.id) } },
    data: { status: ProductStatus.PUBLISHED },
  });

  await logAudit({
    actor,
    action: "products.bulk_publish",
    entityType: "Product",
    entityId: null,
    summary: `Published ${eligible.length} drafts (${skippedCount} skipped at €0)`,
    meta: { publishedSkus: eligible.map((p) => p.sku), skippedCount },
  });

  revalidatePath("/admin/products");
  revalidatePath("/", "layout");
  redirect(
    `/admin/products?status=PUBLISHED&published=${eligible.length}&skipped=${skippedCount}`,
  );
}

// ──────── soft delete / restore / hard delete ───────────────────────────

/** GDPR-friendly: we flag, never drop. Products can be recovered from
 *  the Trash filter on /admin/products until hardDeleteProduct lands them. */
export async function softDeleteProduct(productId: string) {
  await requireAdmin();

  await prisma.product.update({
    where: { id: productId },
    data: { deletedAt: new Date(), status: ProductStatus.ARCHIVED },
  });

  revalidatePath("/admin/products");
  revalidatePath("/", "layout");
  redirect("/admin/products");
}

/** Bring a soft-deleted product back into the active catalogue. Status
 *  stays ARCHIVED (so the shop doesn't suddenly show a long-trashed item)
 *  — Sofia bumps it to PUBLISHED from the editor when she's ready. */
export async function restoreProduct(formData: FormData) {
  const actor = await requireAdmin();
  const productId = String(formData.get("productId") ?? "").trim();
  if (!productId) return;

  await prisma.product.update({
    where: { id: productId },
    data: { deletedAt: null },
  });

  await logAudit({
    actor,
    action: "product.restore",
    entityType: "Product",
    entityId: productId,
    summary: `Restored from trash`,
  });

  revalidatePath("/admin/products");
  redirect(`/admin/products/${productId}`);
}

/**
 * Hard-delete a trashed product. Drops the Product row + cascades through
 * the schema (translations, variants, media, pivots all clear via
 * `onDelete: Cascade`). OrderItem keeps a snapshot of the product/variant
 * info so historical orders survive — but if any order STILL references
 * a variant of this product, we refuse so we don't orphan the FK.
 *
 * Two safeties:
 *   · Product must already be soft-deleted (deletedAt != null) — that's
 *     "moved to trash" — so you can't lose data with one wayward click.
 *   · Refuses if any variant has past OrderItems linked.
 */
export async function hardDeleteProduct(formData: FormData) {
  const actor = await requireAdmin();
  const productId = String(formData.get("productId") ?? "").trim();
  if (!productId) return;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      sku: true,
      deletedAt: true,
      variants: {
        select: {
          id: true,
          _count: { select: { orderItems: true } },
        },
      },
    },
  });
  if (!product) return;

  // Safety 1: must be in trash already.
  if (!product.deletedAt) {
    // Should not be reachable from the UI — Trash is the only entry point —
    // but defend in depth.
    return;
  }

  // Safety 2: any past OrderItems linked? Refuse — Sofia keeps the trashed
  // row instead.
  const totalOrderRefs = product.variants.reduce(
    (n, v) => n + v._count.orderItems,
    0,
  );
  if (totalOrderRefs > 0) {
    // We don't have a great way to surface this to the user from a
    // form-action that uses redirect(); fall through to the trash view
    // and let them notice the product is still there. A better UX (toast
    // via cookie or query param) is a follow-up.
    redirect(`/admin/products?status=TRASH&err=order-refs`);
  }

  await prisma.product.delete({ where: { id: productId } });

  await logAudit({
    actor,
    action: "product.hard_delete",
    entityType: "Product",
    entityId: productId,
    summary: `Permanently deleted ${product.sku}`,
  });

  revalidatePath("/admin/products");
  redirect("/admin/products?status=TRASH");
}

// ──────── media ──────────────────────────────────────────────────────────
//
//  Storage layout:   products/{productId}/{uuid}-{filename}
//  DB layout:        a row in Media pointing at the public URL
//
//  "Primary" is enforced at write-time — only one row per product can have
//  isPrimary=true. The previous primary is cleared inside the same
//  transaction when a new one is chosen.
// ─────────────────────────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB — keep under next.config's 10 MB
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

/** Slug-safe version of the original filename (preserves extension). */
function sanitiseFilename(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  const stem = (dot >= 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
  return ext ? `${stem || "image"}.${ext}` : stem || "image";
}

/**
 * Upload one file into Supabase Storage and link it to the product.
 * Always called as a form post from the Media tab; returns a flat status
 * so we can render per-file errors in the UI later.
 */
export async function uploadProductMedia(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No file selected." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `File is too large. Max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return {
      ok: false,
      message: "Unsupported file type. Use JPG, PNG, WEBP, or AVIF.",
    };
  }

  // How many images does this product already have? (for sortOrder + first-is-primary)
  const existingCount = await prisma.media.count({ where: { productId } });
  const shouldBePrimary = existingCount === 0;

  const safeName = sanitiseFilename(file.name);
  const objectPath = `${productId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin()
    .storage.from(PRODUCT_MEDIA_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      cacheControl: "31536000, immutable",
      upsert: false,
    });

  if (uploadError) {
    return {
      ok: false,
      message: `Upload failed: ${uploadError.message}`,
    };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin()
    .storage.from(PRODUCT_MEDIA_BUCKET)
    .getPublicUrl(objectPath);

  await prisma.media.create({
    data: {
      productId,
      kind: MediaKind.IMAGE,
      url: publicUrl,
      alt: safeName.replace(/\.[^.]+$/, "").replace(/-/g, " "),
      isPrimary: shouldBePrimary,
      sortOrder: existingCount,
    },
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Uploaded." };
}

/** Remove a media row + the underlying Storage object. */
export async function deleteProductMedia(mediaId: string) {
  await requireAdmin();

  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, productId: true, url: true, isPrimary: true },
  });
  if (!media || !media.productId) return;

  // Derive the Storage object path from the public URL.
  //   https://xxxx.supabase.co/storage/v1/object/public/products/<path>
  const marker = `/public/${PRODUCT_MEDIA_BUCKET}/`;
  const idx = media.url.indexOf(marker);
  if (idx >= 0) {
    const objectPath = media.url.slice(idx + marker.length);
    await supabaseAdmin()
      .storage.from(PRODUCT_MEDIA_BUCKET)
      .remove([objectPath]);
  }

  await prisma.media.delete({ where: { id: mediaId } });

  // If we just deleted the primary, promote the next one in sortOrder.
  if (media.isPrimary) {
    const next = await prisma.media.findFirst({
      where: { productId: media.productId },
      orderBy: { sortOrder: "asc" },
    });
    if (next) {
      await prisma.media.update({
        where: { id: next.id },
        data: { isPrimary: true },
      });
    }
  }

  revalidatePath(`/admin/products/${media.productId}`);
  revalidatePath("/", "layout");
}

/** Mark one media row as primary; clear the previous primary. */
export async function setPrimaryMedia(mediaId: string) {
  await requireAdmin();

  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, productId: true },
  });
  if (!media || !media.productId) return;

  await prisma.$transaction([
    prisma.media.updateMany({
      where: { productId: media.productId, isPrimary: true },
      data: { isPrimary: false },
    }),
    prisma.media.update({
      where: { id: media.id },
      data: { isPrimary: true },
    }),
  ]);

  revalidatePath(`/admin/products/${media.productId}`);
  revalidatePath("/", "layout");
}

// ──────── organise tab ───────────────────────────────────────────────────
//
//  Sofia uses this tab to tell each product *what it is* in taxonomy terms:
//    · Categories  (what shelf does it live on)
//    · Skin types  (who is it for)
//    · Concerns    (what does it treat)
//    · Benefits    (what does it give you)
//    · Ingredients (what's inside)
//
//  All five are many-to-many. We treat the submitted list as authoritative
//  and delta-replace: delete links not in the new set, add links not
//  currently linked. That way the editor is a pure picker — no "X to
//  remove" toggles — and the DB stays consistent even if the browser dies
//  mid-submit.
//
//  We also expose `createTaxonomyItem` so the admin can add a new
//  Category/Skin type/etc. inline without leaving the product editor.
//  A dedicated /admin/taxonomy page can come later for renames & merges.
// ─────────────────────────────────────────────────────────────────────────

/** Normalise a FormData list of IDs (repeated field name) into a unique array. */
function collectIds(formData: FormData, field: string): string[] {
  const raw = formData.getAll(field).map((v) => String(v)).filter(Boolean);
  // de-dupe while preserving order
  return Array.from(new Set(raw));
}

/**
 * Save the Organise tab — one action, five relations, all rewritten to
 * match the submitted lists.
 *
 * Strategy: delta-replace per relation. For each join table we wipe all
 * rows that link to this product and recreate the rows from the submitted
 * IDs. That's safer than diffing (no "what did we have before" bookkeeping
 * needed) and fits into one transaction per relation.
 *
 * We don't use Prisma's `set: [...]` connector because join tables here
 * have composite primary keys, not single scalar IDs — `set` expects
 * WhereUniqueInput shapes we'd have to construct anyway.
 */
export async function updateOrganise(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  // Guard against stray requests for a product that's been archived.
  const exists = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true },
  });
  if (!exists) {
    return { ok: false, message: "Product not found." };
  }

  const categoryIds = collectIds(formData, "categoryIds");
  const skinTypeIds = collectIds(formData, "skinTypeIds");
  const concernIds = collectIds(formData, "concernIds");
  const benefitIds = collectIds(formData, "benefitIds");
  const ingredientIds = collectIds(formData, "ingredientIds");

  // Brand picker — single-select, optional. The form sends a string
  // brandId (or "" for "no brand"). We validate the id actually maps to
  // a real Brand row before writing, so a stale or hand-edited form
  // can't silently null out the FK with an unknown UUID.
  //
  // We also pull the brand's slug here so we can DERIVE Product.productLine
  // from it below — the dedicated Lines picker was retired in favour of
  // the single Brand picker, but homepage/shop "Yu•R / Yu•R Pro / Yu•R Me"
  // tabs still query by Product.productLine. Mapping the brand slug to
  // the canonical PRODUCT_LINES dbValue keeps those queries working
  // without any frontend refactor. Non-YU.R brands (when Sofia adds
  // AHC/COSRX/etc.) get productLine=null — they simply don't appear on
  // the YU.R-branded line tabs.
  const rawBrandId = String(formData.get("brandId") ?? "").trim();
  let brandIdToWrite: string | null = null;
  let brandSlugForLineDerivation: string | null = null;
  if (rawBrandId.length > 0) {
    const brand = await prisma.brand.findUnique({
      where: { id: rawBrandId },
      select: { id: true, slug: true },
    });
    if (!brand) {
      return {
        ok: false,
        message: "Selected brand no longer exists. Refresh the page.",
      };
    }
    brandIdToWrite = brand.id;
    brandSlugForLineDerivation = brand.slug;
  }

  // Optional free-text INCI textarea on the Organise tab. Sofia pastes
  // a comma-separated INCI declaration ("Aqua, Glycerin, Niacinamide…")
  // and we (a) upsert each into the master Ingredient library, then
  // (b) merge the resulting IDs into the link set so they're saved
  // alongside the pill-picker selections. This is the manual-editor
  // counterpart to the auto-upsert behaviour in the CSV import — same
  // helper, same data shape.
  const inciFreeText = String(formData.get("ingredientFreeText") ?? "");
  if (inciFreeText.trim().length > 0) {
    const seeds = parseInciTextarea(inciFreeText);
    if (seeds.length > 0) {
      const upserted = await ensureIngredients(seeds);
      for (const id of upserted.values()) {
        if (!ingredientIds.includes(id)) ingredientIds.push(id);
      }
    }
  }

  // Derive Product.productLine from the chosen brand's slug. PRODUCT_LINES
  // already encodes the brand-slug → DB-value mapping (yur → null,
  // yur-pro → "Yu.R PRO", yur-me → "Yu.R Me") so we just look it up.
  // Brands outside that set (future K-beauty additions) get productLine
  // = null, which means they don't appear on any YU.R-branded line tab —
  // the right behaviour, since Yu•R / Yu•R Pro / Yu•R Me tabs are
  // YU.R-house concepts and don't apply to outside brands.
  //
  // extraLines is now always [] because the multi-select Lines picker
  // was retired. If a future requirement re-emerges to put one product
  // on multiple line tabs (e.g. universal gift card), we can restore a
  // dedicated control then. Existing extraLines values on already-saved
  // products remain in the DB until the next time Sofia saves the
  // Organise tab on that product (at which point they're cleared).
  const lineDef = brandSlugForLineDerivation
    ? PRODUCT_LINES.find((l) => l.slug === brandSlugForLineDerivation)
    : undefined;
  const productLineDbValue: string | null = lineDef
    ? ((lineDef.dbValues as readonly (string | null)[]).find(
        (v) => v !== null,
      ) ?? null)
    : null;
  const extraLines: string[] = [];

  try {
    // Persist the line column outside the per-relation transactions.
    // It's a scalar on Product, not a join table — keeping it separate
    // means a relation failure further down doesn't roll back the
    // line edit, which Sofia would find surprising.
    await prisma.product.update({
      where: { id: productId },
      data: {
        productLine: productLineDbValue,
        extraLines,
        // Brand FK lives next to the line columns since they're closely
        // related (line picker + brand picker are both at the top of
        // the Organise form). Writes null when "(none)" is selected.
        brandId: brandIdToWrite,
      },
    });
    // One transaction per relation — small, fast, and a failure on one
    // relation won't poison the others (they'd have succeeded already,
    // which matches the admin's mental model of "save per section").
    await prisma.$transaction([
      prisma.productCategory.deleteMany({ where: { productId } }),
      prisma.productCategory.createMany({
        data: categoryIds.map((categoryId) => ({ productId, categoryId })),
        skipDuplicates: true,
      }),
    ]);
    await prisma.$transaction([
      prisma.productSkinType.deleteMany({ where: { productId } }),
      prisma.productSkinType.createMany({
        data: skinTypeIds.map((skinTypeId) => ({ productId, skinTypeId })),
        skipDuplicates: true,
      }),
    ]);
    await prisma.$transaction([
      prisma.productConcern.deleteMany({ where: { productId } }),
      prisma.productConcern.createMany({
        data: concernIds.map((concernId) => ({ productId, concernId })),
        skipDuplicates: true,
      }),
    ]);
    await prisma.$transaction([
      prisma.productBenefit.deleteMany({ where: { productId } }),
      prisma.productBenefit.createMany({
        data: benefitIds.map((benefitId) => ({ productId, benefitId })),
        skipDuplicates: true,
      }),
    ]);
    await prisma.$transaction([
      prisma.productIngredient.deleteMany({ where: { productId } }),
      prisma.productIngredient.createMany({
        data: ingredientIds.map((ingredientId) => ({
          productId,
          ingredientId,
        })),
        skipDuplicates: true,
      }),
    ]);
  } catch (err) {
    // Most likely cause is a stale ID in the form (e.g. admin deleted a
    // category in another tab). Report gracefully.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        ok: false,
        message:
          "Couldn't save — one of the taxonomy items may have been removed. Refresh and try again.",
      };
    }
    throw err;
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/", "layout");
  return OK;
}

/** Which taxonomy kinds we let the admin create inline from the product editor. */
export type TaxonomyKind =
  | "category"
  | "skinType"
  | "concern"
  | "benefit"
  | "ingredient";

const TaxonomyCreateSchema = z.object({
  kind: z.enum(["category", "skinType", "concern", "benefit", "ingredient"]),
  label: z.string().trim().min(1, "Name is required").max(120),
});

/**
 * Create a new taxonomy item with an English label and auto-slug.
 * Returns the new item's ID on success so the client can toggle it
 * selected immediately. Other locales can be filled in later on a
 * dedicated taxonomy page.
 */
export async function createTaxonomyItem(
  _prev:
    | (ActionState & { createdId?: string })
    | ActionState,
  formData: FormData,
): Promise<ActionState & { createdId?: string }> {
  await requireAdmin();

  const parsed = TaxonomyCreateSchema.safeParse({
    kind: formData.get("kind"),
    label: formData.get("label"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Enter a name to add a new item.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { kind, label } = parsed.data;
  const slug = slugify(label);
  if (!slug) {
    return { ok: false, message: "That name has no letters we can use." };
  }

  try {
    let createdId: string;
    switch (kind) {
      case "category": {
        const row = await prisma.category.create({
          data: {
            slug,
            translations: {
              create: [{ locale: Locale.EN, name: label }],
            },
          },
          select: { id: true },
        });
        createdId = row.id;
        break;
      }
      case "skinType": {
        const row = await prisma.skinType.create({
          data: {
            slug,
            translations: {
              create: [{ locale: Locale.EN, label }],
            },
          },
          select: { id: true },
        });
        createdId = row.id;
        break;
      }
      case "concern": {
        const row = await prisma.concern.create({
          data: {
            slug,
            translations: {
              create: [{ locale: Locale.EN, label }],
            },
          },
          select: { id: true },
        });
        createdId = row.id;
        break;
      }
      case "benefit": {
        const row = await prisma.benefit.create({
          data: {
            slug,
            translations: {
              create: [{ locale: Locale.EN, label }],
            },
          },
          select: { id: true },
        });
        createdId = row.id;
        break;
      }
      case "ingredient": {
        const row = await prisma.ingredient.create({
          data: {
            slug,
            inciName: label, // admin can refine later
            translations: {
              create: [{ locale: Locale.EN, displayName: label }],
            },
          },
          select: { id: true },
        });
        createdId = row.id;
        break;
      }
    }

    revalidatePath("/admin/products");
    return { ok: true, message: "Added.", createdId };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        message: "An item with that slug already exists. Pick a different name.",
      };
    }
    throw err;
  }
}

/**
 * Reorder: one small action per nudge (up / down). The admin clicks
 * arrows on each tile; fewer pieces than drag-and-drop state and works
 * on mobile without the dnd-kit runtime.
 */
export async function moveProductMedia(
  mediaId: string,
  direction: "up" | "down",
) {
  await requireAdmin();

  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, productId: true, sortOrder: true },
  });
  if (!media || !media.productId) return;

  const neighbour = await prisma.media.findFirst({
    where: {
      productId: media.productId,
      sortOrder:
        direction === "up"
          ? { lt: media.sortOrder }
          : { gt: media.sortOrder },
    },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return; // already at the edge

  // Swap sortOrders inside a transaction.
  await prisma.$transaction([
    prisma.media.update({
      where: { id: media.id },
      data: { sortOrder: neighbour.sortOrder },
    }),
    prisma.media.update({
      where: { id: neighbour.id },
      data: { sortOrder: media.sortOrder },
    }),
  ]);

  revalidatePath(`/admin/products/${media.productId}`);
  revalidatePath("/", "layout");
}

// ──────── inventory adjustments ─────────────────────────────────────────
//
// Sofia's manual stock edit path — used for counts, correcting drift,
// receiving a fresh shipment, etc. The signed delta is the *change*, not
// the new total: +10 to add ten units, -1 to burn a tester. We deliberately
// avoid a "set stock to N" field because it makes the log useless (you
// can't distinguish "I received 10" from "I corrected a miscount of 10").
//
// Reason is ADJUSTMENT for free-form edits. Use CSV_IMPORT when wiring
// this into a bulk upload path (not yet built).
// ─────────────────────────────────────────────────────────────────────────

const AdjustStockSchema = z.object({
  variantId: z.string().uuid(),
  delta: z
    .string()
    .trim()
    .transform((v) => {
      const n = Number.parseInt(v.replace(/[^\-0-9]/g, ""), 10);
      return Number.isFinite(n) ? n : NaN;
    })
    .refine((n) => Number.isFinite(n) && n !== 0, {
      message: "Enter a non-zero whole number (e.g. +10 or -1).",
    }),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function adjustVariantStockAction(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = AdjustStockSchema.safeParse({
    variantId: formData.get("variantId"),
    delta: formData.get("delta") ?? "",
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { variantId, delta, note } = parsed.data;

  // Belt-and-braces — confirm the variant lives under this product so the
  // action can't be CSRF'd across unrelated products.
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, productId: true, sku: true, label: true },
  });
  if (!variant || variant.productId !== productId) {
    return { ok: false, message: "Variant not found on this product." };
  }

  let result: { stockAfter: number; appliedDelta: number };
  try {
    result = await prisma.$transaction(async (tx) => {
      return applyMovement(tx, {
        variantId,
        delta,
        reason: "ADJUSTMENT",
        actorId: actor.id,
        actorEmail: actor.email ?? null,
        note,
      });
    });
  } catch (err) {
    console.error("[adjustVariantStockAction] apply failed", err);
    return { ok: false, message: "Couldn't adjust stock. Try again." };
  }

  // Fire-and-forget audit — never block the admin's save.
  await logAudit({
    actor,
    action: "inventory.adjust",
    entityType: "ProductVariant",
    entityId: variantId,
    summary: `${variant.sku} (${variant.label}) · ${
      result.appliedDelta > 0 ? "+" : ""
    }${result.appliedDelta} → ${result.stockAfter}`,
    meta: {
      productId,
      requestedDelta: delta,
      appliedDelta: result.appliedDelta,
      stockAfter: result.stockAfter,
      note,
    },
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/", "layout");

  if (result.appliedDelta !== delta) {
    return {
      ok: true,
      message: `Stock clamped at 0 — applied ${result.appliedDelta}. Now ${result.stockAfter}.`,
    };
  }
  return {
    ok: true,
    message: `Stock ${delta > 0 ? "increased" : "decreased"} by ${Math.abs(
      delta,
    )}. Now ${result.stockAfter}.`,
  };
}

// ──────── variant CRUD ──────────────────────────────────────────────────
//
// The Inventory tab needs to manage variants, not just adjust stock on
// existing ones. Three actions:
//
//   createVariantAction — adds a new size/colour/etc., with optional
//     price override and opening stock. Opening stock writes an INITIAL
//     movement so the audit log has a starting point.
//
//   updateVariantAction — rename label, change SKU, change price/compare
//     price, toggle default. Stock is NOT edited here (use adjustVariant-
//     StockAction for that — we want every stock change in the movement log).
//
//   deleteVariantAction — refuses if any OrderItem references the variant
//     (deleting it would orphan order history). Otherwise hard-delete.
// ─────────────────────────────────────────────────────────────────────────

const VariantBaseSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(60),
  sku: z.string().trim().min(1, "SKU is required").max(64),
  price: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.replace(",", "."))),
  comparePrice: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.replace(",", "."))),
  isDefault: z.coerce.boolean(),
  sortOrder: z
    .string()
    .trim()
    .transform((v) => (v === "" ? 0 : Number.parseInt(v, 10)))
    .refine((n) => Number.isFinite(n) && n >= 0, {
      message: "Sort order must be 0 or a positive whole number",
    }),
});

const CreateVariantSchema = VariantBaseSchema.extend({
  openingStock: z
    .string()
    .trim()
    .transform((v) => (v === "" ? 0 : Number.parseInt(v, 10)))
    .refine((n) => Number.isFinite(n) && n >= 0, {
      message: "Opening stock must be 0 or a positive whole number",
    }),
});

const UpdateVariantSchema = VariantBaseSchema.extend({
  variantId: z.string().uuid(),
});

/** Helper: parse "24.90" / "24,90" into Decimal, or pass through null. */
function decimalOrNull(raw: string | null): Prisma.Decimal | null {
  if (raw === null || raw === "") return null;
  try {
    return new Prisma.Decimal(raw);
  } catch {
    return null;
  }
}

export async function createVariantAction(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = CreateVariantSchema.safeParse({
    label: formData.get("label") ?? "",
    sku: formData.get("sku") ?? "",
    price: formData.get("price") ?? "",
    comparePrice: formData.get("comparePrice") ?? "",
    isDefault: formData.get("isDefault") === "on",
    sortOrder: formData.get("sortOrder") ?? "",
    openingStock: formData.get("openingStock") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Sanity check the parent product exists (and isn't soft-deleted).
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, deletedAt: true },
  });
  if (!product || product.deletedAt) {
    return { ok: false, message: "Product not found." };
  }

  const data = parsed.data;
  const priceDec = decimalOrNull(data.price);
  if (data.price !== null && priceDec === null) {
    return {
      ok: false,
      message: "Price must look like 24.90 (or be left blank to inherit).",
      fieldErrors: { price: ["Invalid number"] },
    };
  }
  const compareDec = decimalOrNull(data.comparePrice);
  if (data.comparePrice !== null && compareDec === null) {
    return {
      ok: false,
      message: "Compare price must look like 29.90.",
      fieldErrors: { comparePrice: ["Invalid number"] },
    };
  }

  let createdId: string;
  try {
    createdId = await prisma.$transaction(async (tx) => {
      // If the new variant claims default, demote any existing default —
      // there can only be one (matches the storefront's selector logic).
      if (data.isDefault) {
        await tx.productVariant.updateMany({
          where: { productId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const v = await tx.productVariant.create({
        data: {
          productId,
          sku: data.sku,
          label: data.label,
          price: priceDec,
          comparePrice: compareDec,
          isDefault: data.isDefault,
          sortOrder: data.sortOrder,
          stock: 0,
        },
        select: { id: true, sku: true, label: true },
      });

      // Opening stock → record as INITIAL movement so the audit trail
      // starts at a real number, not silently at zero.
      if (parsed.data.openingStock > 0) {
        await applyMovement(tx, {
          variantId: v.id,
          delta: parsed.data.openingStock,
          reason: "INITIAL",
          actorId: actor.id,
          actorEmail: actor.email ?? null,
          note: "Opening stock on variant creation",
        });
      }

      return v.id;
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        message: "That SKU is already in use. Pick a different one.",
        fieldErrors: { sku: ["Already in use"] },
      };
    }
    console.error("[createVariantAction] failed", err);
    return { ok: false, message: "Couldn't create variant. Try again." };
  }

  await logAudit({
    actor,
    action: "variant.create",
    entityType: "ProductVariant",
    entityId: createdId,
    summary: `${data.sku} — ${data.label}`,
    meta: { productId, openingStock: parsed.data.openingStock },
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: `Variant "${data.label}" created.` };
}

export async function updateVariantAction(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = UpdateVariantSchema.safeParse({
    variantId: formData.get("variantId"),
    label: formData.get("label") ?? "",
    sku: formData.get("sku") ?? "",
    price: formData.get("price") ?? "",
    comparePrice: formData.get("comparePrice") ?? "",
    isDefault: formData.get("isDefault") === "on",
    sortOrder: formData.get("sortOrder") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  // Check ownership — variant must live under this product.
  const existing = await prisma.productVariant.findUnique({
    where: { id: data.variantId },
    select: { id: true, productId: true, sku: true, label: true },
  });
  if (!existing || existing.productId !== productId) {
    return { ok: false, message: "Variant not found on this product." };
  }

  const priceDec = decimalOrNull(data.price);
  if (data.price !== null && priceDec === null) {
    return {
      ok: false,
      message: "Price must look like 24.90 (or be left blank to inherit).",
      fieldErrors: { price: ["Invalid number"] },
    };
  }
  const compareDec = decimalOrNull(data.comparePrice);
  if (data.comparePrice !== null && compareDec === null) {
    return {
      ok: false,
      message: "Compare price must look like 29.90.",
      fieldErrors: { comparePrice: ["Invalid number"] },
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        // Demote any other default first so the (productId, isDefault=true)
        // invariant only ever has one row at a time.
        await tx.productVariant.updateMany({
          where: { productId, isDefault: true, NOT: { id: data.variantId } },
          data: { isDefault: false },
        });
      }
      await tx.productVariant.update({
        where: { id: data.variantId },
        data: {
          label: data.label,
          sku: data.sku,
          price: priceDec,
          comparePrice: compareDec,
          isDefault: data.isDefault,
          sortOrder: data.sortOrder,
        },
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        message: "That SKU is already in use. Pick a different one.",
        fieldErrors: { sku: ["Already in use"] },
      };
    }
    console.error("[updateVariantAction] failed", err);
    return { ok: false, message: "Couldn't save variant. Try again." };
  }

  await logAudit({
    actor,
    action: "variant.update",
    entityType: "ProductVariant",
    entityId: data.variantId,
    summary: `${data.sku} — ${data.label}`,
    meta: { productId },
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Variant saved." };
}

export async function deleteVariantAction(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const variantId = String(formData.get("variantId") ?? "").trim();
  if (!variantId) return { ok: false, message: "Missing variant id." };

  const existing = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      productId: true,
      sku: true,
      label: true,
      _count: { select: { orderItems: true } },
    },
  });
  if (!existing || existing.productId !== productId) {
    return { ok: false, message: "Variant not found on this product." };
  }

  // Refuse if customer orders reference this variant — deleting would
  // orphan order history. Sofia should archive the parent product instead.
  if (existing._count.orderItems > 0) {
    return {
      ok: false,
      message: `Can't delete — ${existing._count.orderItems} past order(s) reference this variant. Archive the product instead.`,
    };
  }

  try {
    // InventoryMovement and CartItem rows cascade via the schema's
    // onDelete relations. OrderItem doesn't (we keep order history
    // intact) — but we already gated on that count above.
    await prisma.productVariant.delete({ where: { id: variantId } });
  } catch (err) {
    console.error("[deleteVariantAction] failed", err);
    return { ok: false, message: "Couldn't delete variant. Try again." };
  }

  await logAudit({
    actor,
    action: "variant.delete",
    entityType: "ProductVariant",
    entityId: variantId,
    summary: `${existing.sku} — ${existing.label}`,
    meta: { productId },
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: `Variant "${existing.label}" deleted.` };
}

// ──────── AI: suggest tags ───────────────────────────────────────────────
//
// Reads the product's name + INCI + EN description, plus the live
// taxonomy slug lists, and asks Groq for a structured suggestion.
// Does NOT write anything to the DB — the client receives the
// suggestion, renders it as a diff, and Sofia decides.
//
// Returning a discriminated union so the UI can branch cleanly:
//   { ok: true, suggestion: ... }     → render the diff
//   { ok: false, message: ... }       → render an error pill
//
// This action runs synchronously — Llama 4 Scout on Groq classifies
// in ~1-2 seconds, so a brief loading state on the button is fine
// (no streaming UI needed).

export type SuggestTagsResult =
  | {
      ok: true;
      suggestion: SuggestTagsOutput;
      // The current tags so the client can diff without an extra
      // round-trip. Slugs only — labels are looked up from the
      // existing pill options that the form already has. Brand is
      // intentionally NOT in the AI suggestion (Sofia picks YU.R / Pro
      // / Me by hand) so it's not in current either.
      current: {
        categorySlugs: string[];
        skinTypeSlugs: string[];
        concernSlugs: string[];
        benefitSlugs: string[];
      };
    }
  | { ok: false; message: string };

export async function suggestProductTags(
  productId: string,
): Promise<SuggestTagsResult> {
  await requireAdmin();

  // Fetch the product with everything the suggester needs to read +
  // everything the diff needs to display the "current" side. Brand is
  // not fetched — it's outside the AI's scope.
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      id: true,
      inciList: true,
      volumeMl: true,
      translations: {
        where: { locale: Locale.EN },
        select: { name: true, shortDescription: true, description: true },
      },
      categories: { select: { category: { select: { slug: true } } } },
      skinTypes: { select: { skinType: { select: { slug: true } } } },
      concerns: { select: { concern: { select: { slug: true } } } },
      benefits: { select: { benefit: { select: { slug: true } } } },
    },
  });
  if (!product) {
    return { ok: false, message: "Product not found." };
  }

  const en = product.translations[0];
  const productName = en?.name?.trim() ?? "";
  if (!productName) {
    return {
      ok: false,
      message:
        "Add an English product name first — the AI needs that to classify.",
    };
  }

  // Fetch the live taxonomy in one shot. We mirror the EN translations
  // because the AI does better with natural-language labels than with
  // bare slugs (e.g. "Oil Cleansers" reads more clearly than
  // "oil-cleansers" when paired with an INCI list). Brand is omitted
  // — Sofia picks the line by hand.
  const [categories, skinTypes, concerns, benefits] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      select: {
        slug: true,
        parentId: true,
        translations: {
          where: { locale: Locale.EN },
          select: { name: true },
        },
        // We resolve parentSlug via a second pass below — Prisma
        // doesn't let us select parent.slug in one nested call without
        // a relation include that would balloon the query.
        parent: { select: { slug: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    }),
    prisma.skinType.findMany({
      select: {
        slug: true,
        translations: {
          where: { locale: Locale.EN },
          select: { label: true },
        },
      },
      orderBy: { slug: "asc" },
    }),
    prisma.concern.findMany({
      select: {
        slug: true,
        translations: {
          where: { locale: Locale.EN },
          select: { label: true },
        },
      },
      orderBy: { slug: "asc" },
    }),
    prisma.benefit.findMany({
      select: {
        slug: true,
        translations: {
          where: { locale: Locale.EN },
          select: { label: true },
        },
      },
      orderBy: { slug: "asc" },
    }),
  ]);

  // Glue the EN short + long description together so the AI sees one
  // body of copy. shortDescription is usually the more accurate
  // signal; description tends to be marketing fluff.
  const description = [en?.shortDescription ?? "", en?.description ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");

  let suggestion: SuggestTagsOutput;
  try {
    suggestion = await suggestTagsForProduct({
      productName,
      description,
      inciList: product.inciList ?? "",
      volumeMl: product.volumeMl,
      available: {
        categories: categories.map((c) => ({
          slug: c.slug,
          name: c.translations[0]?.name ?? c.slug,
          parentSlug: c.parent?.slug ?? null,
        })),
        skinTypes: skinTypes.map((s) => ({
          slug: s.slug,
          label: s.translations[0]?.label ?? s.slug,
        })),
        concerns: concerns.map((c) => ({
          slug: c.slug,
          label: c.translations[0]?.label ?? c.slug,
        })),
        benefits: benefits.map((b) => ({
          slug: b.slug,
          label: b.translations[0]?.label ?? b.slug,
        })),
      },
    });
  } catch (err) {
    // Most likely cause: GROQ_API_KEY missing on prod, or the AI
    // returned malformed output that didn't validate against the
    // Zod schema. Either way Sofia just gets a polite error pill.
    const message =
      err instanceof Error ? err.message : "AI suggestion failed.";
    return { ok: false, message };
  }

  return {
    ok: true,
    suggestion,
    current: {
      categorySlugs: product.categories.map((x) => x.category.slug),
      skinTypeSlugs: product.skinTypes.map((x) => x.skinType.slug),
      concernSlugs: product.concerns.map((x) => x.concern.slug),
      benefitSlugs: product.benefits.map((x) => x.benefit.slug),
    },
  };
}

// ──────── AI: apply suggested tags ───────────────────────────────────────
//
// Commits a suggestion that Sofia accepted. Validates each slug
// against the live taxonomy (so a stale suggestion can't slip an
// invalid id past), then writes ProductCategory + the three
// single-axis taxonomies in one transaction per relation.
//
// Brand is intentionally NOT touched — Sofia picks the YU.R line
// (Yu•R / Yu•R Pro / Yu•R Me) by hand because the choice depends on
// marketing intent, not formulation. Apply preserves whatever brand
// is currently set on the product.
//
// Strategy: REPLACE on each axis (delete-all + insert-chosen). Same
// pattern as updateOrganise — keeps the action's behaviour predictable.
// If Sofia wants to merge instead of replace, she can untick the
// suggestions she doesn't like in the diff modal before clicking
// Apply, then click again to re-suggest from the new state.

export async function applySuggestedTags(
  productId: string,
  suggestion: SuggestTagsOutput,
): Promise<ActionState> {
  await requireAdmin();

  const exists = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true },
  });
  if (!exists) {
    return { ok: false, message: "Product not found." };
  }

  // Resolve every suggested slug to its DB id. Anything that doesn't
  // resolve is silently dropped — the suggestion was generated against
  // a snapshot of the taxonomy and Sofia might have deleted a chip in
  // the meantime; we'd rather skip the stale tag than fail loudly.
  const [
    categoryRows,
    skinTypeRows,
    concernRows,
    benefitRows,
  ] = await Promise.all([
    prisma.category.findMany({
      where: {
        slug: {
          in: [
            suggestion.parentCategorySlug,
            suggestion.subcategorySlug,
          ].filter((s): s is string => Boolean(s)),
        },
      },
      select: { id: true, slug: true },
    }),
    prisma.skinType.findMany({
      where: { slug: { in: suggestion.skinTypeSlugs } },
      select: { id: true },
    }),
    prisma.concern.findMany({
      where: { slug: { in: suggestion.concernSlugs } },
      select: { id: true },
    }),
    prisma.benefit.findMany({
      where: { slug: { in: suggestion.benefitSlugs } },
      select: { id: true },
    }),
  ]);

  try {
    await prisma.$transaction([
      prisma.productCategory.deleteMany({ where: { productId } }),
      prisma.productCategory.createMany({
        data: categoryRows.map((c) => ({ productId, categoryId: c.id })),
        skipDuplicates: true,
      }),
    ]);
    await prisma.$transaction([
      prisma.productSkinType.deleteMany({ where: { productId } }),
      prisma.productSkinType.createMany({
        data: skinTypeRows.map((s) => ({ productId, skinTypeId: s.id })),
        skipDuplicates: true,
      }),
    ]);
    await prisma.$transaction([
      prisma.productConcern.deleteMany({ where: { productId } }),
      prisma.productConcern.createMany({
        data: concernRows.map((c) => ({ productId, concernId: c.id })),
        skipDuplicates: true,
      }),
    ]);
    await prisma.$transaction([
      prisma.productBenefit.deleteMany({ where: { productId } }),
      prisma.productBenefit.createMany({
        data: benefitRows.map((b) => ({ productId, benefitId: b.id })),
        skipDuplicates: true,
      }),
    ]);

    await logAudit({
      action: "product.ai_categorize",
      entityType: "Product",
      entityId: productId,
      summary: `AI tags applied (${suggestion.confidence})`,
      meta: {
        parentCategorySlug: suggestion.parentCategorySlug,
        subcategorySlug: suggestion.subcategorySlug,
        skinTypeSlugs: suggestion.skinTypeSlugs,
        concernSlugs: suggestion.concernSlugs,
        benefitSlugs: suggestion.benefitSlugs,
      },
    });

    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `AI tags applied (${suggestion.confidence} confidence).`,
    };
  } catch (err) {
    console.error("[applySuggestedTags] failed:", err);
    return { ok: false, message: "Failed to save AI tags. Try again." };
  }
}

// ──────── AI: polish translation text ────────────────────────────────────
//
// Reads the product's name + INCI for context, plus the current values
// of the four polishable fields (name / shortDescription / description
// / howToUse) in the target locale. On non-EN locales also reads the EN
// source so the model can choose: improve existing translation, or
// translate from EN if the locale's value is empty.
//
// Does NOT touch:
//   · slug         — SEO-stable, never let AI rewrite URLs
//   · warnings     — regulatory copy from supplier; rewording risks
//                    compliance issues (cosmetic claims, allergens)
//   · seoTitle     — these are already deterministic-ish (name-based)
//   · seoDescription
//
// Returns the polished values to the client. The client renders a
// per-field diff modal; Sofia clicks Apply to inject the values into
// the form, then Save translation to commit. No DB writes here.
export type PolishTranslationResult =
  | {
      ok: true;
      polished: PolishOutput["polished"];
      // Echo the inputs back so the diff modal can render the
      // "current" side without an extra round-trip.
      currentValues: Record<PolishableField, string>;
    }
  | { ok: false; message: string };

export async function polishProductTranslation(
  productId: string,
  locale: Locale,
): Promise<PolishTranslationResult> {
  await requireAdmin();

  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: {
      id: true,
      inciList: true,
      translations: {
        where: { locale: { in: [Locale.EN, locale] } },
        select: {
          locale: true,
          name: true,
          shortDescription: true,
          description: true,
          howToUse: true,
        },
      },
    },
  });
  if (!product) {
    return { ok: false, message: "Product not found." };
  }

  const en = product.translations.find((t) => t.locale === Locale.EN);
  const cur =
    locale === Locale.EN
      ? en
      : product.translations.find((t) => t.locale === locale);

  if (!en || !en.name?.trim()) {
    return {
      ok: false,
      message:
        "Add an English name + description first — the AI uses EN as the source of truth.",
    };
  }

  const enValues: Record<PolishableField, string> = {
    name: en.name ?? "",
    shortDescription: en.shortDescription ?? "",
    description: en.description ?? "",
    howToUse: en.howToUse ?? "",
  };
  const currentValues: Record<PolishableField, string> = cur
    ? {
        name: cur.name ?? "",
        shortDescription: cur.shortDescription ?? "",
        description: cur.description ?? "",
        howToUse: cur.howToUse ?? "",
      }
    : { name: "", shortDescription: "", description: "", howToUse: "" };

  try {
    const result = await polishProductText({
      locale,
      productNameEn: en.name ?? "",
      inciList: product.inciList ?? "",
      enValues,
      currentValues,
    });
    return { ok: true, polished: result.polished, currentValues };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI polish failed.";
    return { ok: false, message };
  }
}
