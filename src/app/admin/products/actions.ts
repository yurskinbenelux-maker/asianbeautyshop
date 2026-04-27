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
import {
  PRODUCT_MEDIA_BUCKET,
  supabaseAdmin,
} from "@/lib/supabase/admin";
import { upsertAutoRedirect } from "@/lib/redirects/db";
import { applyMovement } from "@/lib/inventory/movements";
import { logAudit } from "@/lib/audit/log";

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

// ──────── soft delete ────────────────────────────────────────────────────

/** GDPR-friendly: we flag, never drop. Products can be recovered from DB. */
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

  try {
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
