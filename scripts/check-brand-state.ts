// Quick read-only state check for the Brand model + Product.brandId.
// Run: pnpm tsx scripts/check-brand-state.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });
  console.log(`\nBrands in DB: ${brands.length}`);
  for (const b of brands) {
    const c = await prisma.product.count({ where: { brandId: b.id } });
    console.log(
      `  • ${b.name} (${b.slug}) country=${b.country ?? "-"} active=${b.isActive} → ${c} products`,
    );
  }

  const total = await prisma.product.count({ where: { deletedAt: null } });
  const withBrand = await prisma.product.count({
    where: { deletedAt: null, brandId: { not: null } },
  });
  console.log(
    `\nProducts: total=${total}  withBrand=${withBrand}  withoutBrand=${total - withBrand}`,
  );

  const groups = await prisma.product.groupBy({
    by: ["productLine"],
    where: { deletedAt: null },
    _count: true,
  });
  console.log("\nproductLine distribution:");
  for (const g of groups) {
    console.log(`  • ${g.productLine ?? "(null)"} → ${g._count} products`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
