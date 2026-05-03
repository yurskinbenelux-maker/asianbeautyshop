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

/**
 * One product slot in the color-block carousel. The carousel cycles
 * through these on the vermilion side; clicking the image takes the
 * visitor to `href`. Empty `imageUrl` slots are skipped at render time.
 */
export type ColorBlockProduct = {
  label: string;     // e.g. "Cushion Foundation"
  imageUrl: string;  // public URL — paste from /admin/media or any CDN
  href: string;      // /shop/cushion-foundation or external — locale-aware Link handles relatives
};

export type HomeHeroSettings = {
  variant: HomeHeroVariant;
  videoUrl: string;
  videoPoster: string;
  /** Legacy single-image fields. Kept for backwards compat — still
   *  consumed by the color-block hero when `colorBlockProducts` is empty. */
  collageUrls: [string, string, string];
  /**
   * The new shape for the Color Block hero — up to 5 products in a
   * carousel. Empty array = fall back to legacy `collageUrls[0]`.
   */
  colorBlockProducts: ColorBlockProduct[];
};

const EMPTY_PRODUCT: ColorBlockProduct = {
  label: "",
  imageUrl: "",
  href: "",
};

export const HOME_HERO_DEFAULTS: HomeHeroSettings = {
  variant: "typography",
  videoUrl: "",
  videoPoster: "",
  collageUrls: ["", "", ""],
  colorBlockProducts: [EMPTY_PRODUCT, EMPTY_PRODUCT, EMPTY_PRODUCT, EMPTY_PRODUCT, EMPTY_PRODUCT],
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
    const rawProducts = Array.isArray(v.colorBlockProducts)
      ? v.colorBlockProducts
      : [];

    // Normalise the product array to exactly 5 slots so the admin form
    // sees a stable shape on every read.
    const colorBlockProducts: ColorBlockProduct[] = Array.from(
      { length: 5 },
      (_, i) => {
        const r = rawProducts[i] as Record<string, unknown> | undefined;
        return {
          label: asString(r?.label),
          imageUrl: asString(r?.imageUrl),
          href: asString(r?.href),
        };
      },
    );

    return {
      variant: isVariant(v.variant) ? v.variant : "typography",
      videoUrl: asString(v.videoUrl),
      videoPoster: asString(v.videoPoster),
      collageUrls: [
        asString(rawCollage[0]),
        asString(rawCollage[1]),
        asString(rawCollage[2]),
      ],
      colorBlockProducts,
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
  // Normalise products to exactly 5 slots before persisting, so the
  // read side always sees the same shape and the admin form's input
  // names stay stable.
  const colorBlockProducts: ColorBlockProduct[] = Array.from(
    { length: 5 },
    (_, i) => ({
      label: next.colorBlockProducts?.[i]?.label ?? "",
      imageUrl: next.colorBlockProducts?.[i]?.imageUrl ?? "",
      href: next.colorBlockProducts?.[i]?.href ?? "",
    }),
  );
  await prisma.setting.upsert({
    where: { key: "home.hero" },
    create: {
      key: "home.hero",
      valueJson: { ...next, collageUrls, colorBlockProducts },
    },
    update: {
      valueJson: { ...next, collageUrls, colorBlockProducts },
    },
  });
}
