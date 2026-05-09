// ─────────────────────────────────────────────────────────────────────────
// prisma/seed.ts — bootstraps the Supabase DB with real YU.R data.
// Run with:  npm run seed    (after `npx prisma migrate dev --name init`)
//
// Idempotent: uses upsert by slug/sku, so running twice won't create dupes.
// an admin can later edit/delete/add via the admin panel.
// ─────────────────────────────────────────────────────────────────────────

import { PrismaClient, Locale, ProductStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱  Seeding Asian Beauty Shop database …");

  // ─── Brand ──────────────────────────────────────────────────────────
  const yur = await prisma.brand.upsert({
    where: { slug: "yur" },
    update: {},
    create: {
      slug: "yur",
      name: "YU.R",
      isActive: true,
      translations: {
        create: [
          {
            locale: Locale.EN,
            tagline: "Korean skincare, considered.",
            story: "<p>YU.R is a curation of the finest Korean houses, brought to Europe by K'Elmus Group.</p>",
          },
          {
            locale: Locale.NL,
            tagline: "Koreaanse huidverzorging, met aandacht.",
            story: "<p>YU.R is een selectie van de fijnste Koreaanse huizen, naar Europa gebracht door K'Elmus Group.</p>",
          },
          {
            locale: Locale.FR,
            tagline: "Soins coréens, avec considération.",
            story: "<p>YU.R est une sélection des plus belles maisons coréennes, apportée en Europe par K'Elmus Group.</p>",
          },
          {
            locale: Locale.RU,
            tagline: "Корейский уход, с вниманием.",
            story: "<p>YU.R — коллекция лучших корейских домов, представленная в Европе компанией K'Elmus Group.</p>",
          },
        ],
      },
    },
  });

  // ─── Categories ─────────────────────────────────────────────────────
  const categoryData = [
    {
      slug: "cleansers",
      names: { EN: "Cleansers", NL: "Reinigers", FR: "Nettoyants", RU: "Очищение" },
    },
    {
      slug: "essences",
      names: { EN: "Essences & Serums", NL: "Essences & Serums", FR: "Essences & Sérums", RU: "Эссенции и сыворотки" },
    },
    {
      slug: "moisturisers",
      names: { EN: "Moisturisers", NL: "Hydratatie", FR: "Hydratants", RU: "Увлажнение" },
    },
    {
      slug: "sun-care",
      names: { EN: "Sun Care", NL: "Zonbescherming", FR: "Protection solaire", RU: "Защита от солнца" },
    },
  ];

  const categories: Record<string, string> = {};
  for (const [i, c] of categoryData.entries()) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        slug: c.slug,
        sortOrder: i,
        translations: {
          create: (Object.entries(c.names) as [keyof typeof c.names, string][]).map(([locale, name]) => ({
            locale: Locale[locale],
            name,
          })),
        },
      },
    });
    categories[c.slug] = cat.id;
  }

  // ─── Products ───────────────────────────────────────────────────────
  const productData = [
    {
      sku: "YUR-CLEANSE-01",
      category: "cleansers",
      price: 28.0,
      volumeMl: 150,
      isBestseller: true,
      isFeatured: false,
      launchedAt: new Date("2026-01-15"),
      names: {
        EN: "Rice Water Cleanser",
        NL: "Rijstwater Reiniger",
        FR: "Nettoyant à l'Eau de Riz",
        RU: "Очищающий Рисовый Гель",
      },
      slugs: {
        EN: "rice-water-cleanser",
        NL: "rijstwater-reiniger",
        FR: "nettoyant-eau-de-riz",
        RU: "ochishchayushchij-risovyj-gel",
      },
      tagline: {
        EN: "Morning ritual · gentle",
        NL: "Ochtendritueel · mild",
        FR: "Rituel du matin · doux",
        RU: "Утренний ритуал · мягкий",
      },
      description: {
        EN: "<p>A low-pH milk cleanser with fermented rice water, made for sensitive skin. Begins every YU.R ritual.</p>",
        NL: "<p>Een milde reiniger met gefermenteerd rijstwater, voor de gevoelige huid. Begin van elk YU.R ritueel.</p>",
        FR: "<p>Un nettoyant doux à l'eau de riz fermentée, pensé pour les peaux sensibles. Le début de chaque rituel YU.R.</p>",
        RU: "<p>Мягкий очищающий гель с ферментированной рисовой водой для чувствительной кожи. Начало каждого ритуала YU.R.</p>",
      },
    },
    {
      sku: "YUR-ESSENCE-01",
      category: "essences",
      price: 64.0,
      volumeMl: 50,
      isBestseller: true,
      isFeatured: true,
      launchedAt: new Date("2026-02-01"),
      names: {
        EN: "Vermilion Essence",
        NL: "Vermiljoen Essence",
        FR: "Essence Vermillon",
        RU: "Эссенция «Вермилион»",
      },
      slugs: {
        EN: "vermilion-essence",
        NL: "vermiljoen-essence",
        FR: "essence-vermillon",
        RU: "essentsiya-vermilion",
      },
      tagline: {
        EN: "Glow, concentrated",
        NL: "Glans, geconcentreerd",
        FR: "Éclat, concentré",
        RU: "Сияние, концентрированное",
      },
      description: {
        EN: "<p>A layered essence with ginseng, niacinamide, and red saffron. Sinks into skin in seconds, leaves a quiet, even glow.</p>",
        NL: "<p>Een gelaagde essence met ginseng, niacinamide en rode saffraan. Trekt in enkele seconden in en achterlaat een rustige, egale gloed.</p>",
        FR: "<p>Une essence en couches avec ginseng, niacinamide et safran rouge. Pénètre en quelques secondes pour un éclat discret et uniforme.</p>",
        RU: "<p>Многослойная эссенция с женьшенем, ниацинамидом и красным шафраном. Впитывается за секунды, оставляя тихое ровное сияние.</p>",
      },
    },
    {
      sku: "YUR-MOIST-01",
      category: "moisturisers",
      price: 42.0,
      volumeMl: 75,
      isBestseller: true,
      isFeatured: false,
      launchedAt: new Date("2026-02-20"),
      names: {
        EN: "Sumi Night Balm",
        NL: "Sumi Nachtbalsem",
        FR: "Baume de Nuit Sumi",
        RU: "Ночной Бальзам «Суми»",
      },
      slugs: {
        EN: "sumi-night-balm",
        NL: "sumi-nachtbalsem",
        FR: "baume-de-nuit-sumi",
        RU: "nochnoj-balzam-sumi",
      },
      tagline: {
        EN: "Repair overnight",
        NL: "Herstel 's nachts",
        FR: "Réparation nocturne",
        RU: "Восстановление за ночь",
      },
      description: {
        EN: "<p>A dense, inky balm with black sesame and centella. Rebuilds the barrier while you sleep.</p>",
        NL: "<p>Een dichte, donkere balsem met zwarte sesam en centella. Herstelt de huidbarrière tijdens de slaap.</p>",
        FR: "<p>Un baume dense et profond aux sésame noir et centella. Reconstruit la barrière cutanée pendant le sommeil.</p>",
        RU: "<p>Плотный тёмный бальзам с чёрным кунжутом и центеллой. Восстанавливает барьер кожи во сне.</p>",
      },
    },
    {
      sku: "YUR-SUN-01",
      category: "sun-care",
      price: 36.0,
      volumeMl: 50,
      isBestseller: false,
      isFeatured: true,
      launchedAt: new Date("2026-03-15"),
      names: {
        EN: "Hanji Sun Veil SPF50+",
        NL: "Hanji Zonnesluier SPF50+",
        FR: "Voile Solaire Hanji SPF50+",
        RU: "Солнцезащитная Вуаль «Ханджи» SPF50+",
      },
      slugs: {
        EN: "hanji-sun-veil-spf50",
        NL: "hanji-zonnesluier-spf50",
        FR: "voile-solaire-hanji-spf50",
        RU: "solntsezashchitnaya-vual-khandzhi-spf50",
      },
      tagline: {
        EN: "Invisible every day",
        NL: "Onzichtbaar elke dag",
        FR: "Invisible au quotidien",
        RU: "Невидимая защита каждый день",
      },
      description: {
        EN: "<p>A weightless chemical sunscreen with no white cast. Wears under makeup, breathes under layers.</p>",
        NL: "<p>Een lichte chemische zonnecrème zonder witte waas. Draagt onder make-up, ademt onder laagjes.</p>",
        FR: "<p>Un écran solaire chimique léger sans voile blanc. Se porte sous le maquillage, respire sous les couches.</p>",
        RU: "<p>Невесомый химический санскрин без белёсого эффекта. Под макияж, дышит под слоями.</p>",
      },
    },
  ];

  for (const p of productData) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        brandId: yur.id,
        status: ProductStatus.PUBLISHED,
        price: p.price,
        volumeMl: p.volumeMl,
        isBestseller: p.isBestseller,
        isFeatured: p.isFeatured,
        launchedAt: p.launchedAt,
        categories: {
          create: [{ categoryId: categories[p.category] }],
        },
        translations: {
          create: (Object.keys(p.names) as (keyof typeof p.names)[]).map((loc) => ({
            locale: Locale[loc],
            name: p.names[loc],
            slug: p.slugs[loc],
            shortDescription: p.tagline[loc],
            description: p.description[loc],
          })),
        },
      },
    });
  }

  console.log("✅  Seed complete.");
  console.log(`   · 1 brand (YU.R), ${categoryData.length} categories, ${productData.length} products × 4 locales`);
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
