// ─────────────────────────────────────────────────────────────────────────
// Save the hero variant + per-variant config from /admin/homepage/hero.
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCapability } from "@/lib/auth-roles";
import {
  writeHomeHeroSettings,
  type HomeHeroSettings,
} from "@/lib/queries/home-hero";

const Schema = z.object({
  variant: z.enum(["typography", "video", "collage"]),
  videoUrl: z.string().trim().max(2000).optional().default(""),
  videoPoster: z.string().trim().max(2000).optional().default(""),
  collage0: z.string().trim().max(2000).optional().default(""),
  collage1: z.string().trim().max(2000).optional().default(""),
  collage2: z.string().trim().max(2000).optional().default(""),
});

export async function saveHomeHeroAction(formData: FormData): Promise<void> {
  await requireCapability("homepage.edit", "/admin/homepage");

  const parsed = Schema.parse(Object.fromEntries(formData));

  const next: HomeHeroSettings = {
    variant: parsed.variant,
    videoUrl: parsed.videoUrl,
    videoPoster: parsed.videoPoster,
    collageUrls: [parsed.collage0, parsed.collage1, parsed.collage2],
  };

  await writeHomeHeroSettings(next);

  // Bust the homepage cache so the new variant shows up immediately.
  revalidatePath("/", "layout");
  redirect("/admin/homepage/hero?saved=1");
}
