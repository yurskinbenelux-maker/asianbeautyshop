import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const products = await prisma.product.findMany({
  where: { status: "PUBLISHED", deletedAt: null },
  include: {
    translations: { where: { locale: "EN" }, select: { name: true, slug: true, shortDescription: true } },
    categories: { include: { category: { select: { slug: true, translations: { where: { locale: "EN" }, select: { name: true } } } } } },
    skinTypes: { include: { skinType: { select: { slug: true } } } },
    concerns: { include: { concern: { select: { slug: true } } } },
    benefits: { include: { benefit: { select: { slug: true } } } },
    ingredients: { include: { ingredient: { select: { slug: true, translations: { where: { locale: "EN" }, select: { name: true } } } } } },
  },
  orderBy: { createdAt: "asc" },
});

console.log(`\n=== ${products.length} PUBLISHED products ===\n`);
for (const p of products) {
  const tr = p.translations[0];
  console.log(`▸ ${tr?.name ?? p.sku}  (sku=${p.sku}, line=${p.productLine ?? "—"}, €${p.price})`);
  console.log(`  slug:        ${tr?.slug}`);
  console.log(`  category:    ${p.categories.map(c => c.category.slug).join(", ") || "—"}`);
  console.log(`  skin type:   ${p.skinTypes.map(s => s.skinType.slug).join(", ") || "—"}`);
  console.log(`  concerns:    ${p.concerns.map(c => c.concern.slug).join(", ") || "—"}`);
  console.log(`  benefits:    ${p.benefits.map(b => b.benefit.slug).join(", ") || "—"}`);
  console.log(`  ingredients: ${p.ingredients.map(i => i.ingredient.translations[0]?.name ?? i.ingredient.slug).slice(0, 8).join(", ") || "—"}${p.ingredients.length > 8 ? ` (+${p.ingredients.length - 8} more)` : ""}`);
  console.log("");
}

await prisma.$disconnect();
