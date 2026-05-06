// ─────────────────────────────────────────────────────────────────────────
// Server actions for the Instagram admin panel.
//
//   saveInstagramConfig  — paste/replace the access token + IG user ID.
//                          Verifies against the Graph API before saving
//                          so Sofia gets immediate feedback.
//   disconnectInstagram  — clear the config (Sofia revoked the token).
//   syncInstagramNow     — manual "Sync now" button. Same code path as
//                          the cron, just triggered by hand.
//   updateInstagramTile  — toggle visibility / set sort order on a
//                          single cached post.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCapability } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { verifyConnection } from "@/lib/instagram/graph-api";
import {
  readIgConfig,
  writeIgConfig,
} from "@/lib/instagram/settings";
import { syncInstagramPosts } from "@/lib/instagram/sync";

function busPaths() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/marketing/instagram");
}

// ─────────────────────────────────────────────────────────────────────────
// Save / verify the access token + IG user ID. We hit the Graph API
// once with the new credentials so any error (wrong user ID, bad
// token, missing permissions) surfaces immediately rather than waiting
// for the next cron.
// ─────────────────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(20, "Access token looks too short")
    .max(500),
  igUserId: z
    .string()
    .trim()
    .regex(/^\d+$/, "IG user ID is a numeric string from Meta")
    .min(5)
    .max(40),
});

export async function saveInstagramConfig(formData: FormData): Promise<void> {
  const ctx = await requireCapability("homepage.edit", "/admin");
  const parsed = ConfigSchema.parse(Object.fromEntries(formData));

  // Verify before saving — if Meta rejects, Sofia gets a clear error
  // banner without ever persisting bad credentials.
  let username: string | undefined;
  let profilePictureUrl: string | undefined;
  try {
    const r = await verifyConnection({
      accessToken: parsed.accessToken,
      igUserId: parsed.igUserId,
    });
    username = r.username;
    profilePictureUrl = r.profilePictureUrl;
  } catch (err) {
    const msg =
      err instanceof Error
        ? encodeURIComponent(err.message.slice(0, 200))
        : "verification-failed";
    redirect(`/admin/marketing/instagram?err=${msg}`);
  }

  await writeIgConfig(
    {
      accessToken: parsed.accessToken,
      igUserId: parsed.igUserId,
      username,
      profilePictureUrl,
      tokenIssuedAt: new Date().toISOString(),
    },
    ctx.user.id,
  );

  busPaths();
  redirect("/admin/marketing/instagram?saved=1");
}

// ─────────────────────────────────────────────────────────────────────────
// Disconnect — wipe the config. The cached posts stay in the DB so
// the homepage continues to render until Sofia clears them or
// re-connects with a new token.
// ─────────────────────────────────────────────────────────────────────────

export async function disconnectInstagram(): Promise<void> {
  const ctx = await requireCapability("homepage.edit", "/admin");
  await writeIgConfig(null, ctx.user.id);
  busPaths();
  redirect("/admin/marketing/instagram?disconnected=1");
}

// ─────────────────────────────────────────────────────────────────────────
// Manual sync. Same code path as /api/cron/instagram-sync.
// ─────────────────────────────────────────────────────────────────────────

export async function syncInstagramNow(): Promise<void> {
  await requireCapability("homepage.edit", "/admin");
  // Guard: don't even try if not configured yet.
  const cfg = await readIgConfig();
  if (!cfg) {
    redirect("/admin/marketing/instagram?err=not-configured");
  }
  const result = await syncInstagramPosts();
  busPaths();
  if (result.ok) {
    redirect(`/admin/marketing/instagram?synced=${result.upserted}`);
  } else {
    const msg = encodeURIComponent(result.error.slice(0, 200));
    redirect(`/admin/marketing/instagram?err=${msg}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Update a single cached post — visibility toggle + sort order. We
// don't allow editing IG-sourced fields (caption, image URL) since
// the next sync would just overwrite them.
// ─────────────────────────────────────────────────────────────────────────

const TileSchema = z.object({
  id: z.string().uuid(),
  isVisible: z
    .union([z.string(), z.undefined()])
    .transform((v) => v !== undefined),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export async function updateInstagramTile(formData: FormData): Promise<void> {
  await requireCapability("homepage.edit", "/admin");
  const parsed = TileSchema.parse(Object.fromEntries(formData));
  await prisma.instagramPost.update({
    where: { id: parsed.id },
    data: {
      isVisible: parsed.isVisible,
      sortOrder: parsed.sortOrder,
    },
  });
  busPaths();
  redirect("/admin/marketing/instagram?saved=1");
}

// ─────────────────────────────────────────────────────────────────────────
// Toggle visibility from the list page (single click — no full form).
// Used by the eye/eye-off icon next to each cached post.
// ─────────────────────────────────────────────────────────────────────────

export async function toggleInstagramTileVisibility(
  formData: FormData,
): Promise<void> {
  await requireCapability("homepage.edit", "/admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const current = await prisma.instagramPost.findUnique({
    where: { id },
    select: { isVisible: true },
  });
  if (!current) return;
  await prisma.instagramPost.update({
    where: { id },
    data: { isVisible: !current.isVisible },
  });
  busPaths();
}
