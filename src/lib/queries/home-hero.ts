// ─────────────────────────────────────────────────────────────────────────
// Homepage hero variant — Sofia picks one of three looks from
// /admin/homepage/hero. Stored as a single Setting row keyed `home.hero`:
//   {
//     variant: "typography" | "video" | "collage",
//     videoUrl: string,        // mp4 for the video variant
//     videoPoster: string,     // optional poster image (first paint)
//     collageUrls: [string, string, string],
//   }
//
// Read returns sane defaults so a fresh DB renders the typography hero
// out of the box. Writes are typed.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { prisma } from "@/lib/prisma";

export type HomeHeroVariant = "typography" | "video" | "collage";

export type HomeHeroSettings = {
  variant: HomeHeroVariant;
  videoUrl: string;
  videoPoster: string;
  collageUrls: [string, string, string];
};

export const HOME_HERO_DEFAULTS: HomeHeroSettings = {
  variant: "typography",
  videoUrl: "",
  videoPoster: "",
  collageUrls: ["", "", ""],
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isVariant(v: unknown): v is HomeHeroVariant {
  return v === "typography" || v === "video" || v === "collage";
}

export async function readHomeHeroSettings(): Promise<HomeHeroSettings> {
  // Same belt-and-braces as home-video.ts — corrupt JSON should never
  // crash the homepage. Fall back to defaults on anything weird.
  try {
    const row = await prisma.setting.findUnique({
      where: { key: "home.hero" },
      select: { valueJson: true },
    });
    if (!row) return HOME_HERO_DEFAULTS;

    const v = row.valueJson as Record<string, unknown> | null;
    if (!v || typeof v !== "object") return HOME_HERO_DEFAULTS;

    const rawCollage = Array.isArray(v.collageUrls) ? v.collageUrls : [];

    return {
      variant: isVariant(v.variant) ? v.variant : "typography",
      videoUrl: asString(v.videoUrl),
      videoPoster: asString(v.videoPoster),
      collageUrls: [
        asString(rawCollage[0]),
        asString(rawCollage[1]),
        asString(rawCollage[2]),
      ],
    };
  } catch (err) {
    console.error("[home-hero] read failed, using defaults", err);
    return HOME_HERO_DEFAULTS;
  }
}

export async function writeHomeHeroSettings(
  next: HomeHeroSettings,
): Promise<void> {
  const collageUrls: [string, string, string] = [
    next.collageUrls[0] ?? "",
    next.collageUrls[1] ?? "",
    next.collageUrls[2] ?? "",
  ];
  await prisma.setting.upsert({
    where: { key: "home.hero" },
    create: {
      key: "home.hero",
      valueJson: { ...next, collageUrls },
    },
    update: {
      valueJson: { ...next, collageUrls },
    },
  });
}
