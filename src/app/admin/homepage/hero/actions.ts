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

// Build a Zod schema entry for one product slot in the carousel.
// Reused 5 times below — keeps the schema declaration short.
const productSlot = (i: number) => ({
  [`product${i}Label`]: z.string().trim().max(120).optional().default(""),
  [`product${i}Image`]: z.string().trim().max(2000).optional().default(""),
  [`product${i}Href`]: z.string().trim().max(2000).optional().default(""),
});

const Schema = z.object({
  variant: z.enum(["typography", "video", "collage"]),
  videoUrl: z.string().trim().max(2000).optional().default(""),
  videoPoster: z.string().trim().max(2000).optional().default(""),
  // CSS object-position values from the FocalPointPicker. Same shape as
  // the popup picker fields — short strings, capped at 60 chars.
  videoObjectPositionDesktop: z.string().trim().max(60).optional().default(""),
  videoObjectPositionMobile: z.string().trim().max(60).optional().default(""),
  collage0: z.string().trim().max(2000).optional().default(""),
  collage1: z.string().trim().max(2000).optional().default(""),
  collage2: z.string().trim().max(2000).optional().default(""),
  ...productSlot(0),
  ...productSlot(1),
  ...productSlot(2),
  ...productSlot(3),
  ...productSlot(4),
});

export async function saveHomeHeroAction(formData: FormData): Promise<void> {
  await requireCapability("homepage.edit", "/admin/homepage");

  const parsed = Schema.parse(Object.fromEntries(formData));

  // Lift the flat product fields back into an array of {label, imageUrl, href}.
  const colorBlockProducts = Array.from({ length: 5 }, (_, i) => ({
    label: parsed[`product${i}Label` as keyof typeof parsed] as string,
    imageUrl: parsed[`product${i}Image` as keyof typeof parsed] as string,
    href: parsed[`product${i}Href` as keyof typeof parsed] as string,
  }));

  const next: HomeHeroSettings = {
    variant: parsed.variant,
    videoUrl: parsed.videoUrl,
    videoPoster: parsed.videoPoster,
    videoObjectPositionDesktop:
      parsed.videoObjectPositionDesktop || "center",
    videoObjectPositionMobile:
      parsed.videoObjectPositionMobile || "center",
    collageUrls: [parsed.collage0, parsed.collage1, parsed.collage2],
    colorBlockProducts,
  };

  await writeHomeHeroSettings(next);

  // Bust the homepage cache so the new variant shows up immediately.
  revalidatePath("/", "layout");
  redirect("/admin/homepage/hero?saved=1");
}
