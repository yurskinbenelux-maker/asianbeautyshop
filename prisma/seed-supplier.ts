// ─────────────────────────────────────────────────────────────────────────
// prisma/seed-supplier.ts — backfills the taxonomy rows referenced by the
// supplier product CSV (yur-products-import.csv).
//
// Run with:  pnpm seed:supplier
//
// Idempotent — every upsert keys on slug, so re-running is a no-op.
// Translations are minimal: EN/NL/FR/RU for categories (the names are short
// enough that Sofia can refine in /admin/categories), and EN-only for
// ingredients (INCI names are international; Sofia adds locale-specific
// display names from /admin/categories/ingredients/[id] as needed).
// ─────────────────────────────────────────────────────────────────────────

import { PrismaClient, Locale } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Categories ────────────────────────────────────────────────────────
const CATEGORIES: ReadonlyArray<{
  slug: string;
  sortOrder: number;
  translations: Record<Locale, string>;
}> = [
  { slug: "cleanser", sortOrder: 0, translations: { EN: "Cleanser", NL: "Reiniger", FR: "Nettoyant", RU: "\u041e\u0447\u0438\u0449\u0430\u044e\u0449\u0435\u0435 \u0441\u0440\u0435\u0434\u0441\u0442\u0432\u043e" } },
  { slug: "cleansing-foam", sortOrder: 1, translations: { EN: "Cleansing Foam", NL: "Reinigingsschuim", FR: "Mousse nettoyante", RU: "\u041e\u0447\u0438\u0449\u0430\u044e\u0449\u0430\u044f \u043f\u0435\u043d\u043a\u0430" } },
  { slug: "cleansing-oil", sortOrder: 2, translations: { EN: "Cleansing Oil", NL: "Reinigingsolie", FR: "Huile d\u00e9maquillante", RU: "\u0413\u0438\u0434\u0440\u043e\u0444\u0438\u043b\u044c\u043d\u043e\u0435 \u043c\u0430\u0441\u043b\u043e" } },
  { slug: "peeling-gel", sortOrder: 3, translations: { EN: "Peeling Gel", NL: "Peelinggel", FR: "Gel exfoliant", RU: "\u041f\u0438\u043b\u0438\u043d\u0433-\u0433\u0435\u043b\u044c" } },
  { slug: "toner", sortOrder: 4, translations: { EN: "Toner", NL: "Toner", FR: "Tonique", RU: "\u0422\u043e\u043d\u0438\u043a" } },
  { slug: "essence", sortOrder: 5, translations: { EN: "Essence", NL: "Essence", FR: "Essence", RU: "\u042d\u0441\u0441\u0435\u043d\u0446\u0438\u044f" } },
  { slug: "serum", sortOrder: 6, translations: { EN: "Serum", NL: "Serum", FR: "S\u00e9rum", RU: "\u0421\u044b\u0432\u043e\u0440\u043e\u0442\u043a\u0430" } },
  { slug: "emulsion", sortOrder: 7, translations: { EN: "Emulsion", NL: "Emulsie", FR: "\u00c9mulsion", RU: "\u042d\u043c\u0443\u043b\u044c\u0441\u0438\u044f" } },
  { slug: "lotion", sortOrder: 8, translations: { EN: "Lotion", NL: "Lotion", FR: "Lotion", RU: "\u041b\u043e\u0441\u044c\u043e\u043d" } },
  { slug: "cream", sortOrder: 9, translations: { EN: "Cream", NL: "Cr\u00e8me", FR: "Cr\u00e8me", RU: "\u041a\u0440\u0435\u043c" } },
  { slug: "cream-mask", sortOrder: 10, translations: { EN: "Cream Mask", NL: "Cr\u00e8memasker", FR: "Masque cr\u00e8me", RU: "\u041a\u0440\u0435\u043c-\u043c\u0430\u0441\u043a\u0430" } },
  { slug: "sheet-mask", sortOrder: 11, translations: { EN: "Sheet Mask", NL: "Sheet Mask", FR: "Masque tissu", RU: "\u0422\u043a\u0430\u043d\u0435\u0432\u0430\u044f \u043c\u0430\u0441\u043a\u0430" } },
  { slug: "cc-cream", sortOrder: 12, translations: { EN: "CC Cream", NL: "CC-cr\u00e8me", FR: "Cr\u00e8me CC", RU: "CC-\u043a\u0440\u0435\u043c" } },
  { slug: "dd-cream", sortOrder: 13, translations: { EN: "DD Cream", NL: "DD-cr\u00e8me", FR: "Cr\u00e8me DD", RU: "DD-\u043a\u0440\u0435\u043c" } },
  { slug: "cushion", sortOrder: 14, translations: { EN: "Cushion", NL: "Cushion", FR: "Cushion", RU: "\u041a\u0443\u0448\u043e\u043d" } },
  { slug: "sunscreen", sortOrder: 15, translations: { EN: "Sunscreen", NL: "Zonnebrand", FR: "Cr\u00e8me solaire", RU: "\u0421\u043e\u043b\u043d\u0446\u0435\u0437\u0430\u0449\u0438\u0442\u043d\u043e\u0435 \u0441\u0440\u0435\u0434\u0441\u0442\u0432\u043e" } },
];

// ─── Ingredients (INCI) ────────────────────────────────────────────────
// Display name in EN matches the INCI standard form. Sofia can add
// localised display names + descriptions later from the admin.
const INGREDIENTS: ReadonlyArray<{ slug: string; inciName: string }> = [
  { slug: "acacia-senegal-bark-extract", inciName: "Acacia Senegal Bark Extract" },
  { slug: "acetyl-hexapeptide-8", inciName: "Acetyl Hexapeptide-8" },
  { slug: "adenosine", inciName: "Adenosine" },
  { slug: "allantoin", inciName: "Allantoin" },
  { slug: "aloe-barbadensis-leaf-juice", inciName: "Aloe Barbadensis Leaf Juice" },
  { slug: "ascorbyl-glucoside", inciName: "Ascorbyl Glucoside" },
  { slug: "asiaticoside", inciName: "Asiaticoside" },
  { slug: "bentonite", inciName: "Bentonite" },
  { slug: "beta-glucan", inciName: "Beta-Glucan" },
  { slug: "bifida-ferment-filtrate", inciName: "Bifida Ferment Filtrate" },
  { slug: "butyl-avocadate", inciName: "Butyl Avocadate" },
  { slug: "camellia-japonica-flower-extract", inciName: "Camellia Japonica Flower Extract" },
  { slug: "camellia-sinensis-leaf-extract", inciName: "Camellia Sinensis Leaf Extract" },
  { slug: "capryloyl-glycine", inciName: "Capryloyl Glycine" },
  { slug: "caprylyl-glycol", inciName: "Caprylyl Glycol" },
  { slug: "centella-asiatica-extract", inciName: "Centella Asiatica Extract" },
  { slug: "ceramide-np", inciName: "Ceramide NP" },
  { slug: "ceramides", inciName: "Ceramides" },
  { slug: "chamomilla-recutita-extract", inciName: "Chamomilla Recutita Extract" },
  { slug: "copper-tripeptide-1", inciName: "Copper Tripeptide-1" },
  { slug: "ethylhexylglycerin", inciName: "Ethylhexylglycerin" },
  { slug: "fullerenes", inciName: "Fullerenes" },
  { slug: "galactomyces-ferment-filtrate", inciName: "Galactomyces Ferment Filtrate" },
  { slug: "glyceryl-glucoside", inciName: "Glyceryl Glucoside" },
  { slug: "glycyrrhiza-glabra-licorice-root-extract", inciName: "Glycyrrhiza Glabra (Licorice) Root Extract" },
  { slug: "gold-600ppm", inciName: "Gold (600ppm)" },
  { slug: "hippophae-rhamnoides-fruit-extract", inciName: "Hippophae Rhamnoides Fruit Extract" },
  { slug: "hippophae-rhamnoides-oil", inciName: "Hippophae Rhamnoides Oil" },
  { slug: "hydrolyzed-collagen", inciName: "Hydrolyzed Collagen" },
  { slug: "hydrolyzed-collagen-extract", inciName: "Hydrolyzed Collagen Extract" },
  { slug: "hydrolyzed-glycosaminoglycans", inciName: "Hydrolyzed Glycosaminoglycans" },
  { slug: "hydrolyzed-hyaluronic-acid", inciName: "Hydrolyzed Hyaluronic Acid" },
  { slug: "kaolin", inciName: "Kaolin" },
  { slug: "lactobacillus", inciName: "Lactobacillus" },
  { slug: "lactobacillus-soybean-ferment-extract", inciName: "Lactobacillus/Soybean Ferment Extract" },
  { slug: "leontopodium-alpinum-extract", inciName: "Leontopodium Alpinum Extract" },
  { slug: "madecassoside", inciName: "Madecassoside" },
  { slug: "magnesium-ascorbyl-phosphate", inciName: "Magnesium Ascorbyl Phosphate" },
  { slug: "melaleuca-alternifolia-tea-tree-leaf-extract", inciName: "Melaleuca Alternifolia (Tea Tree) Leaf Extract" },
  { slug: "niacinamide", inciName: "Niacinamide" },
  { slug: "oryza-sativa-extract", inciName: "Oryza Sativa Extract" },
  { slug: "palmitoyl-tripeptide-5", inciName: "Palmitoyl Tripeptide-5" },
  { slug: "pearl-powder", inciName: "Pearl Powder" },
  { slug: "plant-amino-acids", inciName: "Plant Amino Acids" },
  { slug: "royal-jelly-extract", inciName: "Royal Jelly Extract" },
  { slug: "saccharomyces-rice-ferment-filtrate", inciName: "Saccharomyces/Rice Ferment Filtrate" },
  { slug: "scutellaria-baicalensis-root-extract", inciName: "Scutellaria Baicalensis Root Extract" },
  { slug: "sh-oligopeptide-1", inciName: "sh-Oligopeptide-1" },
  { slug: "snail-secretion-filtrate", inciName: "Snail Secretion Filtrate" },
  { slug: "sodium-ascorbyl-phosphate", inciName: "Sodium Ascorbyl Phosphate" },
  { slug: "sodium-hyaluronate", inciName: "Sodium Hyaluronate" },
  { slug: "sodium-hyaluronate-crosspolymer", inciName: "Sodium Hyaluronate Crosspolymer" },
  { slug: "squalane", inciName: "Squalane" },
  { slug: "titanium-dioxide", inciName: "Titanium Dioxide" },
  { slug: "tocopheryl-acetate", inciName: "Tocopheryl Acetate" },
  { slug: "trehalose", inciName: "Trehalose" },
  { slug: "tremella-fuciformis-extract", inciName: "Tremella Fuciformis Extract" },
  { slug: "zinc-oxide", inciName: "Zinc Oxide" },
];

async function main() {
  console.log("🌱  Seeding taxonomy from supplier CSV …");

  // Brand sanity check — main seed should have created `yur` already, but
  // this seed must be self-sufficient so a fresh dev DB can run it standalone.
  // country="KR" honors the supplier sheet's "Brand country" column at the
  // right grain (per-brand, not duplicated 35 times across products).
  await prisma.brand.upsert({
    where: { slug: "yur" },
    update: { country: "KR" },
    create: { slug: "yur", name: "YU.R", isActive: true, country: "KR" },
  });

  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { sortOrder: c.sortOrder, isActive: true },
      create: { slug: c.slug, sortOrder: c.sortOrder, isActive: true },
    });
    for (const [locale, name] of Object.entries(c.translations) as [Locale, string][]) {
      await prisma.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: cat.id, locale } },
        update: { name },
        create: { categoryId: cat.id, locale, name },
      });
    }
  }
  console.log(`   ✓ ${CATEGORIES.length} categories upserted`);

  for (const i of INGREDIENTS) {
    const ing = await prisma.ingredient.upsert({
      where: { slug: i.slug },
      update: { inciName: i.inciName },
      create: { slug: i.slug, inciName: i.inciName, isKeyAsset: true },
    });
    // EN displayName mirrors INCI — gives the public /ingredients page
    // something readable until Sofia writes deeper copy.
    await prisma.ingredientTranslation.upsert({
      where: { ingredientId_locale: { ingredientId: ing.id, locale: Locale.EN } },
      update: { displayName: i.inciName },
      create: { ingredientId: ing.id, locale: Locale.EN, displayName: i.inciName },
    });
  }
  console.log(`   ✓ ${INGREDIENTS.length} ingredients upserted`);

  console.log("✅  Done. Re-run the CSV import — warnings should clear.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
