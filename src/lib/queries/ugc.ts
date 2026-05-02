// ─────────────────────────────────────────────────────────────────────────
// UGC photo query helper for the PDP.
//
// Returns up to N active photos tagged to a product, ordered by the
// admin-curated sortOrder + creation date as a tiebreaker. Empty list
// when there's nothing to show — the PDP section hides itself when so.
// ─────────────────────────────────────────────────────────────────────────

import "server-only";
import { prisma } from "@/lib/prisma";

export type UgcPhoto = {
  id: string;
  imageUrl: string;
  customerFirstName: string | null;
  caption: string | null;
};

export async function getUgcForProduct(
  productId: string,
  limit = 8,
): Promise<UgcPhoto[]> {
  const rows = await prisma.ugcPhoto.findMany({
    where: { productId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      imageUrl: true,
      customerFirstName: true,
      caption: true,
    },
  });
  return rows;
}
