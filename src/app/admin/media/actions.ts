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
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_MEDIA_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const OK_SAVED: ActionState = { ok: true, message: "Saved." };

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

  const path = objectPathFromUrl(media.url);
  if (path) {
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

  // Remove storage objects in one batch call (Supabase accepts up to 1000).
  const paths = orphans
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
