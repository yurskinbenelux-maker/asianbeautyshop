import "server-only";

import { revalidatePath } from "next/cache";

/** Bust cached sitemap routes after admin content changes. */
export function revalidateSitemap(): void {
  revalidatePath("/sitemap.xml");
  revalidatePath("/sitemap-products.xml");
}
