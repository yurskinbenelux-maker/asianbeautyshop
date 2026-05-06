// ─────────────────────────────────────────────────────────────────────────
// Server actions for the Instagram showcase admin (CRUD on InstagramPost).
// Three actions: createInstagramPost, updateInstagramPost, deleteInstagramPost.
// All gated by `homepage.edit` capability — same as the rest of /admin/marketing.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCapability } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

const Schema = z.object({
  imageUrl: z.string().trim().url("Image URL must be a valid http(s) URL").max(2000),
  imageAlt: z.string().trim().max(300).optional().default(""),
  // Loose URL match — IG occasionally serves /reel/, /p/, /tv/ etc. We
  // accept anything on instagram.com or instagr.am.
  postUrl: z
    .string()
    .trim()
    .url("Post URL must be a valid http(s) URL")
    .max(2000)
    .refine(
      (v) => /^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\//i.test(v),
      { message: "Post URL must point to instagram.com" },
    ),
  caption: z.string().trim().max(300).optional().default(""),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isActive: z
    .union([z.string(), z.undefined()])
    .transform((v) => v !== undefined),
});

function busPaths() {
  // Hit both the homepage cache and the admin list so each side
  // re-renders with the new state on next request.
  revalidatePath("/", "layout");
  revalidatePath("/admin/marketing/instagram");
}

export async function createInstagramPost(formData: FormData): Promise<void> {
  await requireCapability("homepage.edit", "/admin");
  const parsed = Schema.parse(Object.fromEntries(formData));
  await prisma.instagramPost.create({
    data: {
      imageUrl: parsed.imageUrl,
      imageAlt: parsed.imageAlt || null,
      postUrl: parsed.postUrl,
      caption: parsed.caption || null,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
    },
  });
  busPaths();
  redirect("/admin/marketing/instagram?saved=1");
}

export async function updateInstagramPost(formData: FormData): Promise<void> {
  await requireCapability("homepage.edit", "/admin");
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing id");
  const parsed = Schema.parse(Object.fromEntries(formData));
  await prisma.instagramPost.update({
    where: { id },
    data: {
      imageUrl: parsed.imageUrl,
      imageAlt: parsed.imageAlt || null,
      postUrl: parsed.postUrl,
      caption: parsed.caption || null,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
    },
  });
  busPaths();
  redirect("/admin/marketing/instagram?saved=1");
}

export async function deleteInstagramPost(formData: FormData): Promise<void> {
  await requireCapability("homepage.edit", "/admin");
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing id");
  await prisma.instagramPost.delete({ where: { id } });
  busPaths();
  redirect("/admin/marketing/instagram?deleted=1");
}
