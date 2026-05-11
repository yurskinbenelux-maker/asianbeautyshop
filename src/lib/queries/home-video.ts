// ─────────────────────────────────────────────────────────────────────────
// Homepage video reel settings — dedicated module so we don't bloat the
// generic settings.ts union for one feature.
//
// Stored as a single Setting row keyed `home.video`:
//   { mode: "off" | "single" | "trio", urls: string[], poster?: string }
//
// Read returns sane defaults when the row doesn't exist yet so the
// homepage renders cleanly on a fresh DB. Writes are typed.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { prisma } from "@/lib/prisma";

export type HomeVideoMode = "off" | "single" | "trio";

export type HomeVideoSettings = {
  mode: HomeVideoMode;
  /**
   * mp4 URLs (or any browser-playable codec). Single mode uses urls[0];
   * trio mode uses urls[0..2]. Extra URLs are ignored. Missing URLs in
   * trio mode are rendered as a soft placeholder so an admin can ship in
   * stages.
   */
  urls: string[];
  /**
   * Optional poster image URL — shown for first paint while the video
   * downloads. Recommend a 1920×1080 JPEG for `single`, or a 1080×1920
   * JPEG when used in trio mode (we just apply it to all three).
   */
  poster: string;
  /**
   * Optional eyebrow + headline shown above the reel. Empty strings
   * hide them — useful when you want pure footage with no text.
   */
  eyebrow: string;
  headline: string;
};

export const HOME_VIDEO_DEFAULTS: HomeVideoSettings = {
  mode: "off",
  urls: ["", "", ""],
  poster: "",
  eyebrow: "",
  headline: "",
};

/**
 * Coerce an unknown value to a clean string. We use this everywhere we
 * read user-provided data from JSON — protects render code from `null`,
 * `undefined`, numbers, or other shapes that crash `.trim()`.
 */
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Type guard — used after JSON parsing to keep render code branch-free. */
function isHomeVideoSettings(v: unknown): v is HomeVideoSettings {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.mode === "off" || o.mode === "single" || o.mode === "trio") &&
    Array.isArray(o.urls)
  );
}

export async function readHomeVideoSettings(): Promise<HomeVideoSettings> {
  // The Setting table is a raw key/value store, so any read here is a
  // soft-trust boundary — we never assume the JSON exactly matches the
  // type. Wrap in try/catch so a corrupt row can't crash the homepage.
  try {
    const row = await prisma.setting.findUnique({
      where: { key: "home.video" },
      select: { valueJson: true },
    });
    if (!row) return HOME_VIDEO_DEFAULTS;

    const parsed = row.valueJson;
    if (!isHomeVideoSettings(parsed)) return HOME_VIDEO_DEFAULTS;

    // Coerce every URL slot through asString so a stale row containing
    // null/undefined/numbers can never crash the render code.
    const rawUrls = Array.isArray(parsed.urls) ? parsed.urls : [];
    const urls = [
      asString(rawUrls[0]),
      asString(rawUrls[1]),
      asString(rawUrls[2]),
    ];

    return {
      mode: parsed.mode,
      urls,
      poster: asString(parsed.poster),
      eyebrow: asString(parsed.eyebrow),
      headline: asString(parsed.headline),
    };
  } catch (err) {
    console.error("[home-video] read failed, using defaults", err);
    return HOME_VIDEO_DEFAULTS;
  }
}

export async function writeHomeVideoSettings(
  next: HomeVideoSettings,
): Promise<void> {
  // Normalise the URLs array to exactly 3 slots so the read side never
  // sees a ragged shape.
  const urls = [...next.urls, "", "", ""].slice(0, 3);
  await prisma.setting.upsert({
    where: { key: "home.video" },
    create: {
      key: "home.video",
      valueJson: { ...next, urls },
    },
    update: {
      valueJson: { ...next, urls },
    },
  });
}
