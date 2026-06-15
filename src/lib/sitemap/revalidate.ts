import "server-only";

import { revalidatePath } from "next/cache";

/** Bust the cached /sitemap.xml after admin content changes. */
export function revalidateSitemap(): void {
  revalidatePath("/sitemap.xml");
}
