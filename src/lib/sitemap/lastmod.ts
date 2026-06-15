import { revalidatePath } from "next/cache";

/** Pick the newest timestamp from related rows — used for sitemap lastmod. */
export function latestSitemapDate(
  ...dates: (Date | null | undefined)[]
): Date {
  let latest = new Date(0);
  for (const d of dates) {
    if (d && d > latest) latest = d;
  }
  return latest;
}

/** Bust the cached /sitemap.xml after admin content changes. */
export function revalidateSitemap(): void {
  revalidatePath("/sitemap.xml");
}
