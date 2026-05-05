// ─────────────────────────────────────────────────────────────────────────
// scripts/verify-category-migration.ts
//
// Post-migration sanity check. Answers three questions:
//
//   1. Did the new tree get created? (parents + children + sortOrder set)
//   2. Is every published product tagged into the NEW tree, or are there
//      products still living only on legacy flat categories?
//   3. How many legacy flat categories are still active (i.e. need
//      --archive-old to be run)?
//
// Run:
//   pnpm tsx scripts/verify-category-migration.ts
// ─────────────────────────────────────────────────────────────────────────

import { PrismaClient, ProductStatus, Locale } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── 1. Tree shape ─────────────────────────────────────────────────────
  const allCats = await prisma.category.findMany({
    include: {
      translations: { where: { locale: Locale.EN }, select: { name: true } },
    },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { slug: "asc" }],
  });

  const parents = allCats.filter((c) => c.parentId === null);
  const children = allCats.filter((c) => c.parentId !== null);
  const activeParents = parents.filter((c) => c.isActive);
  const activeChildren = children.filter((c) => c.isActive);
  const inactiveCount = allCats.filter((c) => !c.isActive).length;

  // Spot zero-sortOrder parents (would mean migration didn't set them).
  const parentsWithoutSort = activeParents.filter((c) => c.sortOrder === 0);

  console.log("\n──────── 1 · Tree shape ────────");
  console.log(`  Total categories:    ${allCats.length}`);
  console.log(`  Active parents:      ${activeParents.length}`);
  console.log(`  Active children:     ${activeChildren.length}`);
  console.log(`  Archived (legacy):   ${inactiveCount}`);
  if (parentsWithoutSort.length > 0) {
    console.log(
      `  ⚠ Active parents with sortOrder=0 (${parentsWithoutSort.length}):`,
      parentsWithoutSort.map((c) => c.slug).join(", "),
    );
  }

  // List the active tree.
  console.log("\n  Active tree:");
  for (const p of activeParents) {
    const kids = activeChildren.filter((c) => c.parentId === p.id);
    const label = p.translations[0]?.name ?? p.slug;
    console.log(`    • ${label} (${p.slug}) — ${kids.length} subs`);
    for (const k of kids) {
      const klabel = k.translations[0]?.name ?? k.slug;
      console.log(`        – ${klabel} (${k.slug})`);
    }
  }

  // ── 2. Products still on legacy-only ──────────────────────────────────
  // Pull the IDs of all parented (new-tree) categories. A product that
  // doesn't have at least one ProductCategory pointing to one of these
  // is living only on the legacy flat tags.
  const newTreeCategoryIds = new Set([
    ...activeParents.map((c) => c.id),
    ...activeChildren.map((c) => c.id),
  ]);

  const allPublished = await prisma.product.findMany({
    where: { status: ProductStatus.PUBLISHED, deletedAt: null },
    include: {
      categories: { select: { categoryId: true } },
      translations: {
        where: { locale: Locale.EN },
        select: { name: true },
      },
    },
  });

  const stranded = allPublished.filter(
    (p) => !p.categories.some((pc) => newTreeCategoryIds.has(pc.categoryId)),
  );

  console.log("\n──────── 2 · Products by tagging ────────");
  console.log(`  Published products:       ${allPublished.length}`);
  console.log(
    `  Tagged into NEW tree:     ${allPublished.length - stranded.length}`,
  );
  console.log(`  ⚠ Stranded (legacy only): ${stranded.length}`);
  if (stranded.length > 0) {
    console.log("\n    These products will VANISH from the mega-menu after");
    console.log("    --archive-old. Re-tag them in /admin/products before");
    console.log("    archiving the legacy categories:");
    for (const p of stranded.slice(0, 25)) {
      const name = p.translations[0]?.name ?? "(no EN name)";
      console.log(`      · ${name}  [${p.sku}]`);
    }
    if (stranded.length > 25) {
      console.log(`      …and ${stranded.length - 25} more.`);
    }
  }

  // ── 3. Legacy flats still active ──────────────────────────────────────
  // A "legacy flat" = an active category with no parentId AND no children.
  // The new-tree parents have children, so they're easy to distinguish.
  const legacyFlats = activeParents.filter(
    (p) => !activeChildren.some((c) => c.parentId === p.id),
  );

  console.log("\n──────── 3 · Legacy flats still visible ────────");
  if (legacyFlats.length === 0) {
    console.log("  ✓ None — picker is clean.");
  } else {
    console.log(
      `  ⚠ ${legacyFlats.length} top-level categories with NO children`,
    );
    console.log("    are still active. Run --archive-old to hide them:");
    for (const c of legacyFlats) {
      const name = c.translations[0]?.name ?? c.slug;
      console.log(`      · ${name}  (${c.slug})`);
    }
  }

  console.log("\n──────── Summary ────────");
  const okTree = activeParents.length >= 6 && activeChildren.length >= 12;
  const okTagging = stranded.length === 0;
  const okClean = legacyFlats.length === 0;
  console.log(`  Tree shape:        ${okTree ? "✓" : "⚠"}`);
  console.log(`  Product tagging:   ${okTagging ? "✓" : "⚠"}`);
  console.log(`  Legacy cleared:    ${okClean ? "✓" : "⚠ run --archive-old"}`);
  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
