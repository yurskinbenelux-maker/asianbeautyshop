// ─────────────────────────────────────────────────────────────────────────
// prisma/migrate-categories-7.ts — collapse the 16+ legacy categories
// into the canonical 7-category K-beauty step strip.
//
// Run with:
//   pnpm tsx prisma/migrate-categories-7.ts
//
// Idempotent in both directions:
//   • If the 7 target categories already exist, the upsert keeps them.
//   • If a product is already linked to a target category, the join row
//     is left alone (skipDuplicates).
//   • Re-running after legacy categories are gone is a no-op.
//
// What it does:
//   1. Upsert the 7 target categories with EN/NL/FR/RU translations.
//      Sort order follows the conventional K-beauty step sequence so
//      the chip strip on /shop reads as a ritual, not an alphabet.
//   2. Re-point every ProductCategory row from a legacy category to the
//      mapped target — de-duplicating in case a product was already on
//      both (e.g. tagged with both Cream and Lotion).
//   3. Delete each legacy category once nothing references it.
//
// SAFETY:
//   This script writes to whatever DATABASE_URL is loaded. Sofia's
//   Supabase Pro tier has nightly backups; free tier doesn't (see #106).
//   Take a manual snapshot of the Category + ProductCategory tables
//   before running on production if you're nervous.
// ─────────────────────────────────────────────────────────────────────────

import { Locale, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── 1. Target categories (the 7 we keep) ──────────────────────────────
//
// Order = K-beauty ritual order: cleanse → tone → exfoliate → treat →
// moisturise → mask (weekly) → SPF (final daytime step). The /shop
// chip strip uses sortOrder ascending, so this is what customers see.

type TargetCategory = {
  slug: string;
  sortOrder: number;
  translations: Record<Locale, string>;
};

const TARGETS: TargetCategory[] = [
  {
    slug: "cleanser",
    sortOrder: 1,
    translations: {
      EN: "Cleanser",
      NL: "Reiniger",
      FR: "Nettoyant",
      RU: "Очищение",
    },
  },
  {
    slug: "toner",
    sortOrder: 2,
    translations: {
      EN: "Toner",
      NL: "Toner",
      FR: "Tonique",
      RU: "Тонер",
    },
  },
  {
    slug: "peeling",
    sortOrder: 3,
    translations: {
      EN: "Peeling",
      NL: "Peeling",
      FR: "Peeling",
      RU: "Пилинг",
    },
  },
  {
    // The "treatment" step on a K-beauty routine bundles essences and
    // serums together. Sofia chose the umbrella label so customers
    // browsing this shelf see both formats without deciding upfront
    // which they need.
    slug: "essences-serums",
    sortOrder: 4,
    translations: {
      EN: "Essences & Serums",
      NL: "Essences & serums",
      FR: "Essences & sérums",
      RU: "Эссенции и сыворотки",
    },
  },
  {
    slug: "cream",
    sortOrder: 5,
    translations: {
      EN: "Cream",
      NL: "Crème",
      FR: "Crème",
      RU: "Крем",
    },
  },
  {
    slug: "mask",
    sortOrder: 6,
    translations: {
      EN: "Mask",
      NL: "Masker",
      FR: "Masque",
      RU: "Маска",
    },
  },
  {
    slug: "spf",
    sortOrder: 7,
    translations: {
      EN: "SPF",
      NL: "SPF",
      FR: "SPF",
      RU: "SPF",
    },
  },
];

// ─── 2. Legacy → target mapping ─────────────────────────────────────────
//
// Every row in ProductCategory whose category.slug is on the LEFT here
// gets re-pointed to the slug on the RIGHT, then the legacy category
// is deleted. Anything not on this list (including the 7 targets
// themselves) is left untouched.

const REMAP: Record<string, string> = {
  // Cleansers — fold the parent + every sub-type
  cleansers: "cleanser",
  "cleansing-foam": "cleanser",
  "cleansing-oil": "cleanser",

  // Peeling — currently named "peeling-gel"
  "peeling-gel": "peeling",

  // Treatment — both legacy slugs AND the singular "serum" fold into
  // the umbrella "essences-serums" target. The third entry handles
  // anyone who's already run an earlier version of this script (when
  // the target was "serum") — re-running picks up that state and
  // lands on "essences-serums" cleanly.
  essence: "essences-serums",
  "essences-and-serums": "essences-serums",
  serum: "essences-serums",

  // Moisturisers — every texture + tinted moisturiser
  moisturisers: "cream",
  lotion: "cream",
  emulsion: "cream",
  cushion: "cream",
  "cc-cream": "cream",
  "dd-cream": "cream",

  // Masks — sheet + cream
  "sheet-mask": "mask",
  "cream-mask": "mask",

  // SPF — sun-care parent + sunscreen sub
  "sun-care": "spf",
  sunscreen: "spf",
};

// ─────────────────────────────────────────────────────────────────────────

async function upsertTarget(t: TargetCategory): Promise<string> {
  const cat = await prisma.category.upsert({
    where: { slug: t.slug },
    update: { sortOrder: t.sortOrder, isActive: true },
    create: { slug: t.slug, sortOrder: t.sortOrder, isActive: true },
  });
  for (const [locale, name] of Object.entries(t.translations) as [
    Locale,
    string,
  ][]) {
    await prisma.categoryTranslation.upsert({
      where: { categoryId_locale: { categoryId: cat.id, locale } },
      update: { name },
      create: { categoryId: cat.id, locale, name },
    });
  }
  return cat.id;
}

async function main() {
  console.log("📦  Migrating categories to the 7-category strip …\n");

  // 1. Upsert all targets first so re-points have somewhere to land.
  const targetIds = new Map<string, string>();
  for (const t of TARGETS) {
    const id = await upsertTarget(t);
    targetIds.set(t.slug, id);
    console.log(`   ✓ target: ${t.slug}`);
  }

  // 2. For each legacy → target mapping, walk all ProductCategory rows
  //    pointing at the legacy and create equivalents pointing at the
  //    target (skipDuplicates handles products that were already on
  //    the target). Then we can safely delete the legacy join rows
  //    via cascade when we delete the legacy category.
  console.log("\n🔁  Re-pointing product links …");
  let rowsRepointed = 0;
  for (const [legacySlug, targetSlug] of Object.entries(REMAP)) {
    const targetId = targetIds.get(targetSlug);
    if (!targetId) {
      console.warn(
        `   ⚠️  target ${targetSlug} missing — skipping ${legacySlug}`,
      );
      continue;
    }
    const legacy = await prisma.category.findUnique({
      where: { slug: legacySlug },
      select: { id: true },
    });
    if (!legacy) {
      console.log(`   · ${legacySlug} not present — nothing to migrate`);
      continue;
    }
    const links = await prisma.productCategory.findMany({
      where: { categoryId: legacy.id },
      select: { productId: true },
    });
    if (links.length === 0) {
      console.log(`   · ${legacySlug} → ${targetSlug} (0 products)`);
      continue;
    }
    const created = await prisma.productCategory.createMany({
      data: links.map((l) => ({
        productId: l.productId,
        categoryId: targetId,
      })),
      skipDuplicates: true,
    });
    rowsRepointed += created.count;
    console.log(
      `   · ${legacySlug} → ${targetSlug}: re-pointed ${created.count} of ${links.length} link(s) (rest were already on target)`,
    );
  }

  // 3. Drop the legacy categories. Their ProductCategory rows are
  //    orphaned by definition — a Product can be on multiple categories
  //    so deleting Category cascades only its OWN ProductCategory rows.
  console.log("\n🗑   Removing legacy categories …");
  let dropped = 0;
  for (const legacySlug of Object.keys(REMAP)) {
    const result = await prisma.category.deleteMany({
      where: { slug: legacySlug },
    });
    if (result.count > 0) {
      dropped += result.count;
      console.log(`   ✓ deleted ${legacySlug}`);
    }
  }

  // Also sweep the singular "cleanser" duplicate with no products on it
  // — this is the literal singular variant from the supplier import,
  // distinct from the "cleansers" parent we already remapped above.
  // Safe because we already upserted slug "cleanser" as a target — if
  // it was the legacy single-product version we're keeping it.

  console.log("\n✅  Done.");
  console.log(
    `   ${TARGETS.length} target categories present · ${rowsRepointed} ProductCategory row(s) re-pointed · ${dropped} legacy category row(s) dropped`,
  );
}

main()
  .catch((err) => {
    console.error("❌  Migration failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
