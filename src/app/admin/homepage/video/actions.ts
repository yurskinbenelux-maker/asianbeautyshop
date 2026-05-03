// ─────────────────────────────────────────────────────────────────────────
// Save the homepage video reel config.
//
// Form posts the mode + up to 3 URLs + optional poster + optional eyebrow/
// headline. We trust the URL fields — they're entered by an authenticated
// admin pasting from /admin/media or a CDN, and the public component
// renders them straight into a <video src=…> tag (no eval, no XSS surface).
// ─────────────────────────────────────────────────────────────────────────

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCapability } from "@/lib/auth-roles";
import {
  writeHomeVideoSettings,
  type HomeVideoSettings,
} from "@/lib/queries/home-video";

const Schema = z.object({
  mode: z.enum(["off", "single", "trio"]),
  url0: z.string().trim().max(2000).optional().default(""),
  url1: z.string().trim().max(2000).optional().default(""),
  url2: z.string().trim().max(2000).optional().default(""),
  poster: z.string().trim().max(2000).optional().default(""),
  eyebrow: z.string().trim().max(120).optional().default(""),
  headline: z.string().trim().max(200).optional().default(""),
});

export async function saveHomeVideoAction(
  formData: FormData,
): Promise<void> {
  // Same capability bar as the rest of the homepage editor.
  await requireCapability("homepage.edit", "/admin/homepage");

  const parsed = Schema.parse(Object.fromEntries(formData));

  const next: HomeVideoSettings = {
    mode: parsed.mode,
    urls: [parsed.url0, parsed.url1, parsed.url2],
    poster: parsed.poster,
    eyebrow: parsed.eyebrow,
    headline: parsed.headline,
  };

  await writeHomeVideoSettings(next);

  // Bust the homepage cache so the change shows up immediately on /.
  revalidatePath("/", "layout");
  redirect("/admin/homepage/video?saved=1");
}
