import "server-only";

import { revalidatePath } from "next/cache";

const SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap-index.xml",
  "/sitemap-pages.xml",
  "/sitemap-products.xml",
  "/sitemap-categories.xml",
  "/sitemap-brands.xml",
  "/sitemap-ingredients.xml",
] as const;

/** Bust cached sitemap routes after admin content changes. */
export function revalidateSitemap(): void {
  for (const path of SITEMAP_PATHS) {
    revalidatePath(path);
  }
}
