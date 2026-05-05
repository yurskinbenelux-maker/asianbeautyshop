// Read-only diagnostic. Lists every product whose extraLines contains
// values, plus the product's primary productLine, so we can spot any
// stale or mismatched data that might trip downstream code.
//
// Run: pnpm tsx scripts/check-extra-lines.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const all = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      sku: true,
      status: true,
      productLine: true,
      extraLines: true,
      brand: { select: { slug: true, name: true } },
      translations: {
        where: { locale: "EN" },
        select: { name: true },
      },
    },
  });

  const withExtras = all.filter((p) => p.extraLines && p.extraLines.length > 0);

  console.log(`\nTotal products: ${all.length}`);
  console.log(`Products with extraLines set: ${withExtras.length}\n`);

  if (withExtras.length === 0) {
    console.log("All products have empty extraLines — clean.");
  } else {
    console.log("Products with extraLines:");
    for (const p of withExtras) {
      const name = p.translations[0]?.name ?? "(no EN name)";
      console.log(
        `  · ${name} [${p.sku}] status=${p.status}\n` +
          `      brand=${p.brand?.slug ?? "(none)"}  ` +
          `productLine=${JSON.stringify(p.productLine)}  ` +
          `extraLines=${JSON.stringify(p.extraLines)}`,
      );
    }
  }

  // Also: any products with NULL productLine and NULL brandId (would be
  // orphaned w.r.t. line tabs).
  const orphans = all.filter(
    (p) => !p.brand && (p.productLine === null || p.productLine === ""),
  );
  console.log(`\nProducts with no brand AND no productLine: ${orphans.length}`);
  for (const p of orphans) {
    const name = p.translations[0]?.name ?? "(no EN name)";
    console.log(`  · ${name} [${p.sku}]`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
