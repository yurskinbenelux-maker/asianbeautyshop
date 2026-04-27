// ─────────────────────────────────────────────────────────────────────────
// Server actions for /admin/media.
//
// Uploads to the bucket happen from the product editor (creates a Media
// row linked to the product). The library itself only *manages* existing
// media: update alt text, delete, or bulk delete orphans.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MediaKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_MEDIA_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echoed back to the client when an action returned a new resource id. */
  createdId?: string;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

/** Max upload size in bytes — matches the bucket's "8 MB each" hint. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Allowed MIME types — same allowlist as the product editor uploader. */
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/**
 * Make a filename safe for a Supabase Storage object key. Strips path
 * separators, replaces non-ASCII with underscores, collapses runs of
 * unsafe characters. Keeps the extension.
 */
function sanitiseFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : "";
  const safeBase = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${safeBase || "image"}${safeExt}`;
}

// ──────── helpers ────────────────────────────────────────────────────────

/**
 * The `url` column stores the full Supabase public URL. To delete the
 * file we need the object path (everything after `/public/{bucket}/`).
 * Returns null if the URL isn't from our bucket (e.g. seeded Unsplash
 * placeholder) so we skip Storage calls rather than error.
 */
function objectPathFromUrl(url: string): string | null {
  const marker = `/public/${PRODUCT_MEDIA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

function refresh() {
  revalidatePath("/admin/media");
  revalidatePath("/admin/products", "layout");
  revalidatePath("/", "layout");
}

// ──────── update alt text ───────────────────────────────────────────────

const UpdateAltSchema = z.object({
  id: z.string().uuid(),
  alt: z.string().trim().max(200),
});

export async function updateMediaAltAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = UpdateAltSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await prisma.media.update({
    where: { id: parsed.data.id },
    data: { alt: parsed.data.alt || null },
  });

  refresh();
  return OK_SAVED;
}

// ──────── delete one media ──────────────────────────────────────────────

export async function deleteMediaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing id." };

  const media = await prisma.media.findUnique({
    where: { id },
    select: {
      id: true,
      url: true,
      isPrimary: true,
      productId: true,
      _count: { select: { banners: true } },
    },
  });
  if (!media) return { ok: false, message: "Media not found." };

  // Refuse to delete media that's attached to an active homepage banner —
  // that'd leave a broken image on the shop homepage.
  if (media._count.banners > 0) {
    return {
      ok: false,
      message: "This image is used on a banner. Remove it there first.",
    };
  }

  // Ref-count on the URL: a single uploaded file may now back many
  // Media rows (one per linked product) since linkMediaToProductAction
  // shares storage. We only delete the storage object when this row is
  // the LAST reference — otherwise other products would lose their image.
  const otherRefsCount = await prisma.media.count({
    where: { url: media.url, NOT: { id: media.id } },
  });

  const path = objectPathFromUrl(media.url);
  if (path && otherRefsCount === 0) {
    // Best-effort: if the Storage call fails (file already gone), we still
    // delete the DB row. The alternative — stranded rows pointing at dead
    // URLs — would be worse.
    await supabaseAdmin()
      .storage.from(PRODUCT_MEDIA_BUCKET)
      .remove([path])
      .catch(() => undefined);
  }

  await prisma.media.delete({ where: { id } });

  // If this was a product's primary image, promote the next one in line
  // so the product card doesn't suddenly go blank.
  if (media.isPrimary && media.productId) {
    const next = await prisma.media.findFirst({
      where: { productId: media.productId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (next) {
      await prisma.media.update({
        where: { id: next.id },
        data: { isPrimary: true },
      });
    }
  }

  refresh();
  return { ok: true, message: "Deleted." };
}

// ──────── bulk delete orphans ───────────────────────────────────────────

export async function deleteOrphansAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const confirm = String(formData.get("confirm") ?? "");
  if (confirm !== "DELETE") {
    return {
      ok: false,
      message: "Type DELETE to confirm.",
      fieldErrors: { confirm: ["Type DELETE to confirm."] },
    };
  }

  // Orphans = no productId AND not used on any banner.
  const orphans = await prisma.media.findMany({
    where: { productId: null, banners: { none: {} } },
    select: { id: true, url: true },
  });

  if (orphans.length === 0) {
    return { ok: true, message: "No orphans to delete." };
  }

  // Ref-counted storage cleanup: only remove a storage object if no
  // other Media row (outside this orphan set) still points at the URL.
  // We need this because the new library/link model lets multiple Media
  // rows share a single storage object — wiping one orphan must not
  // break another product that's still referencing it.
  const orphanIds = new Set(orphans.map((m) => m.id));
  const orphanUrls = orphans.map((m) => m.url);
  const surviveRefs = await prisma.media.findMany({
    where: { url: { in: orphanUrls }, id: { notIn: Array.from(orphanIds) } },
    select: { url: true },
  });
  const survivingUrls = new Set(surviveRefs.map((r) => r.url));

  const paths = orphans
    .filter((m) => !survivingUrls.has(m.url))
    .map((m) => objectPathFromUrl(m.url))
    .filter((p): p is string => p !== null);
  if (paths.length > 0) {
    await supabaseAdmin()
      .storage.from(PRODUCT_MEDIA_BUCKET)
      .remove(paths)
      .catch(() => undefined);
  }

  await prisma.media.deleteMany({
    where: { id: { in: orphans.map((m) => m.id) } },
  });

  refresh();
  return { ok: true, message: `Deleted ${orphans.length} orphan image(s).` };
}

// ──────── upload directly to the library (no product attached) ────────
//
// Creates a Media row with productId=null so it sits in the library
// asset pool until Sofia links it to one or more products via
// linkMediaToProductAction. The Storage object lives under "library/"
// to keep the bucket organised separately from product-uploaded files.
export async function uploadLibraryMediaAction(
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
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      message: "Unsupported file type. Use JPG, PNG, WEBP, or AVIF.",
    };
  }

  const safeName = sanitiseFilename(file.name);
  const objectPath = `library/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin()
    .storage.from(PRODUCT_MEDIA_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      cacheControl: "31536000, immutable",
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, message: `Upload failed: ${uploadError.message}` };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin()
    .storage.from(PRODUCT_MEDIA_BUCKET)
    .getPublicUrl(objectPath);

  const created = await prisma.media.create({
    data: {
      productId: null,
      kind: MediaKind.IMAGE,
      url: publicUrl,
      // Best-effort placeholder alt — Sofia can override in the drawer.
      alt: safeName.replace(/\.[^.]+$/, "").replace(/-/g, " "),
      isPrimary: false,
      sortOrder: 0,
    },
  });

  refresh();
  return { ok: true, message: "Uploaded.", createdId: created.id };
}

// ──────── link a library image to a product ───────────────────────────
//
// Reusing a single uploaded file across multiple PDPs is achieved by
// creating a NEW Media row with the same `url` (and storage path,
// implicitly) but a different productId. We don't duplicate the storage
// object — only the DB row. Ref-count on the URL is what guards
// deletion later (see deleteMediaAction).
//
// If `setAsPrimary` is true we clear any existing primary on that
// product first, so the new copy becomes the card image.
const LinkSchema = z.object({
  mediaId: z.string().uuid(),
  productId: z.string().uuid(),
  setAsPrimary: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export async function linkMediaToProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = LinkSchema.safeParse({
    mediaId: formData.get("mediaId"),
    productId: formData.get("productId"),
    setAsPrimary: formData.get("setAsPrimary") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Invalid input." };
  }
  const { mediaId, productId, setAsPrimary } = parsed.data;

  // Source asset to copy from. We pull the canonical URL/alt/dimensions —
  // alt is intentionally copied so the new product copy starts with the
  // library's alt text, but Sofia can edit it per-row afterwards.
  const source = await prisma.media.findUnique({
    where: { id: mediaId },
    select: {
      url: true,
      alt: true,
      width: true,
      height: true,
      kind: true,
    },
  });
  if (!source) return { ok: false, message: "Source image not found." };

  // Idempotency: if this product already has a Media row pointing at the
  // same URL, don't create a duplicate. Toggle isPrimary if requested.
  const existing = await prisma.media.findFirst({
    where: { productId, url: source.url },
    select: { id: true, isPrimary: true },
  });
  if (existing) {
    if (setAsPrimary && !existing.isPrimary) {
      await prisma.$transaction([
        prisma.media.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        }),
        prisma.media.update({
          where: { id: existing.id },
          data: { isPrimary: true },
        }),
      ]);
    }
    refresh();
    return {
      ok: true,
      message: "Already linked.",
      createdId: existing.id,
    };
  }

  // Sort order: append after this product's existing images.
  const siblingCount = await prisma.media.count({ where: { productId } });

  // If the caller wants this to be the new primary, clear any current
  // primary in the same transaction so we never leave the product with
  // two primaries (or none, mid-flight).
  const ops = [];
  if (setAsPrimary) {
    ops.push(
      prisma.media.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      }),
    );
  }

  const createOp = prisma.media.create({
    data: {
      productId,
      kind: source.kind,
      url: source.url,
      alt: source.alt,
      width: source.width,
      height: source.height,
      isPrimary: setAsPrimary || siblingCount === 0,
      sortOrder: siblingCount,
    },
  });

  // The transaction returns an array; we want the created id from the
  // last op so we can echo it back (handy for selecting the row in UI).
  const txResults = await prisma.$transaction([...ops, createOp]);
  const created = txResults[txResults.length - 1] as { id: string };

  refresh();
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true, message: "Linked.", createdId: created.id };
}

// ──────── set primary for a product ────────────────────────────────────

export async function setPrimaryMediaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing id." };

  const media = await prisma.media.findUnique({
    where: { id },
    select: { id: true, productId: true, isPrimary: true },
  });
  if (!media || !media.productId) {
    return { ok: false, message: "Only linked images can be set as primary." };
  }
  if (media.isPrimary) return { ok: true, message: "Already primary." };

  // Atomic swap: clear all siblings then set this one.
  await prisma.$transaction([
    prisma.media.updateMany({
      where: { productId: media.productId, isPrimary: true },
      data: { isPrimary: false },
    }),
    prisma.media.update({ where: { id }, data: { isPrimary: true } }),
  ]);

  refresh();
  return { ok: true, message: "Primary image updated." };
}
