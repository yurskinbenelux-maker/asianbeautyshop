// ─────────────────────────────────────────────────────────────────────────
// Homepage hero variant — an admin picks one of three looks from
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
  /** Optional mobile-specific assets. A 16:9 cinematic shoot rarely
   *  works well on a portrait phone — it ends up letterboxed or with
   *  the subject cropped. An admin can paste a separately framed video
   *  (often a 9:16 portrait shoot of the same scene) and the public
   *  hero swaps to it when `(max-width: 767px)` matches. Empty string
   *  = fall back to the desktop video, so existing setups keep working
   *  unchanged. The poster behaves the same way. */
  videoUrlMobile: string;
  videoPosterMobile: string;
  /** CSS `object-position` value applied to the cinematic <video> at
   *  desktop breakpoints (md+). Defaults to "center" — same crop the
   *  feature shipped with. An admin sets these via the focal-point
   *  picker on /admin/homepage/hero (using the poster as the editor
   *  canvas) so mobile crops can differ from the perfect desktop
   *  composition.
   *
   *  Same shape as the popup positions — short CSS string, parsed by
   *  the browser's native CSS engine. Invalid values silently render
   *  as if "center". */
  videoObjectPositionDesktop: string;
  videoObjectPositionMobile: string;
  /** How many seconds the poster image stays fully visible before
   *  cross-fading to the playing video underneath. Set to 0 to make
   *  the fade immediate (effectively disabling the intro). Default 2.5.
   *  Stored as a decimal number of seconds for friendlier admin UX —
   *  HeroVideo converts to ms internally.  */
  videoPosterHoldSeconds: number;
  /** How many seconds the opacity transition takes when the poster
   *  fades out. Default 0.7. Set to 0 for an instant cut (rare). */
  videoPosterFadeSeconds: number;
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
  videoUrlMobile: "",
  videoPosterMobile: "",
  videoObjectPositionDesktop: "center",
  videoObjectPositionMobile: "center",
  videoPosterHoldSeconds: 2.5,
  videoPosterFadeSeconds: 0.7,
  collageUrls: ["", "", ""],
  colorBlockProducts: [EMPTY_PRODUCT, EMPTY_PRODUCT, EMPTY_PRODUCT, EMPTY_PRODUCT, EMPTY_PRODUCT],
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Clamp a JSON value to a sane decimal-seconds range. Bounded at 0..max
 *  so an admin can't paste 99999 by accident and freeze the hero. */
function asSeconds(v: unknown, fallback: number, max = 30): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, n));
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
      // Mobile-specific assets — missing keys fall through to "" so
      // old Setting rows continue to render the desktop video on all
      // viewports (existing behaviour preserved).
      videoUrlMobile: asString(v.videoUrlMobile),
      videoPosterMobile: asString(v.videoPosterMobile),
      // Missing keys fall through to "center" — old Setting rows from
      // before this feature shipped don't have these fields, so the
      // empty-string fallback would render "center" anyway at the
      // browser level. Setting it explicitly keeps the admin form's
      // pre-fill consistent.
      videoObjectPositionDesktop:
        asString(v.videoObjectPositionDesktop) || "center",
      videoObjectPositionMobile:
        asString(v.videoObjectPositionMobile) || "center",
      videoPosterHoldSeconds: asSeconds(
        v.videoPosterHoldSeconds,
        HOME_HERO_DEFAULTS.videoPosterHoldSeconds,
      ),
      videoPosterFadeSeconds: asSeconds(
        v.videoPosterFadeSeconds,
        HOME_HERO_DEFAULTS.videoPosterFadeSeconds,
      ),
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
