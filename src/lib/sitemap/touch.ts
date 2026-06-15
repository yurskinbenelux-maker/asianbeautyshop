import "server-only";

import { type Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidateSitemap } from "./revalidate";

/** Bump content timestamps so PDP sitemap lastmod reflects admin edits. */
export async function touchProductSitemapLastmod(
  productId: string,
  locale?: Locale,
) {
  const now = new Date();
  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { updatedAt: now },
    }),
    ...(locale
      ? [
          prisma.productTranslation.updateMany({
            where: { productId, locale },
            data: { updatedAt: now },
          }),
        ]
      : []),
  ]);
  revalidateSitemap();
}
