import { prisma } from "@/lib/prisma";
import { revalidateSitemap } from "./lastmod";

/** Bump Product.updatedAt so PDP sitemap lastmod reflects content edits. */
export async function touchProductSitemapLastmod(productId: string) {
  await prisma.product.update({
    where: { id: productId },
    data: { updatedAt: new Date() },
  });
  revalidateSitemap();
}
