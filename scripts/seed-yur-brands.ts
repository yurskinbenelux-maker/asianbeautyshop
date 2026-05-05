// ─────────────────────────────────────────────────────────────────────────
// scripts/seed-yur-brands.ts
//
// Phase C · Step 1 — seed the three YU.R house brands as Brand rows and
// backfill Product.brandId from the existing Product.productLine string.
//
// Why:
//   The mega-menu's right column reads Brand records. We don't ship UI
//   for /admin/brands yet (deferred until Sofia adds her first non-YU.R
//   brand), so this script is the only path to populate Brand for now.
//
// What it does:
//   1. Upserts three Brand rows by slug:
//        yur     → "YU.R"     (country KR)
//        yur-pro → "YU.R Pro" (country KR)
//        yur-me  → "YU.R Me"  (country KR)
//      Idempotent — re-running is a no-op.
//
//   2. For every product with brandId=null, looks at productLine string
//      and sets brandId to the matching Brand:
//        null / ""   → yur
//        "Yu.R PRO"  → yur-pro
//        "Yu.R Me"   → yur-me
//      Products that already have brandId set are NOT touched (so
//      manual overrides stay).
//
//   3. Prints a summary.
//
// Run:
//   pnpm tsx scripts/seed-yur-brands.ts --dry-run
//   pnpm tsx scripts/seed-yur-brands.ts --apply
// ─────────────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DRY_RUN = !process.argv.includes("--apply");

// Mirror PRODUCT_LINES.dbValues from src/lib/queries/products.ts so the
// backfill matches whatever the Lines picker has been writing.
const SEED = [
  {
    slug: "yur",
    name: "YU.R",
    country: "KR",
    matchProductLineValues: [null, ""], // default line (no value set)
  },
  {
    slug: "yur-pro",
    name: "YU.R Pro",
    country: "KR",
    matchProductLineValues: ["Yu.R PRO"],
  },
  {
    slug: "yur-me",
    name: "YU.R Me",
    country: "KR",
    matchProductLineValues: ["Yu.R Me"],
  },
];

async function main() {
  console.log(`\n[seed] Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY"}`);

  // ── 1. Upsert Brand rows ──────────────────────────────────────────────
  console.log("\n[seed] Step 1 — upsert YU.R brands");
  const brandIdBySlug = new Map<string, string>();
  for (const b of SEED) {
    if (DRY_RUN) {
      const existing = await prisma.brand.findUnique({
        where: { slug: b.slug },
      });
      if (existing) {
        console.log(
          `  • ${b.name} (${b.slug}) — already exists (id=${existing.id})`,
        );
        brandIdBySlug.set(b.slug, existing.id);
      } else {
        console.log(`  • ${b.name} (${b.slug}) — would create`);
        brandIdBySlug.set(b.slug, "DRY-RUN-PENDING");
      }
    } else {
      const row = await prisma.brand.upsert({
        where: { slug: b.slug },
        update: {
          name: b.name,
          country: b.country,
          isActive: true,
        },
        create: {
          slug: b.slug,
          name: b.name,
          country: b.country,
          isActive: true,
        },
        select: { id: true, name: true },
      });
      console.log(`  • ${row.name} (${b.slug}) ✓`);
      brandIdBySlug.set(b.slug, row.id);
    }
  }

  // ── 2. Backfill brandId on products ───────────────────────────────────
  console.log(
    "\n[seed] Step 2 — backfill Product.brandId from productLine string",
  );

  const untagged = await prisma.product.findMany({
    where: { deletedAt: null, brandId: null },
    select: { id: true, sku: true, productLine: true },
  });
  console.log(`  ${untagged.length} products with brandId=null`);

  let updated = 0;
  let skipped = 0;
  const histogram = new Map<string, number>();

  for (const p of untagged) {
    // Find which seed entry matches this product's productLine.
    const match = SEED.find((s) =>
      s.matchProductLineValues.includes(p.productLine),
    );
    if (!match) {
      // Unknown productLine value (Sofia put a custom string in there).
      // Default to YU.R since these are all currently YU.R products.
      const fallback = SEED.find((s) => s.slug === "yur")!;
      const targetId = brandIdBySlug.get(fallback.slug)!;
      const key = `(unknown:"${p.productLine}") → yur`;
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
      if (!DRY_RUN) {
        await prisma.product.update({
          where: { id: p.id },
          data: { brandId: targetId },
        });
      }
      updated++;
      continue;
    }

    const targetId = brandIdBySlug.get(match.slug);
    if (!targetId || targetId === "DRY-RUN-PENDING") {
      // Dry-run mode — count the would-be update without writing.
      const key = `${match.slug}`;
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
      updated++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.product.update({
        where: { id: p.id },
        data: { brandId: targetId },
      });
    }
    const key = `${match.slug}`;
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
    updated++;
  }

  // Skipped = products that already had brandId set; not refetched here
  // but worth surfacing.
  const alreadyTagged = await prisma.product.count({
    where: { deletedAt: null, brandId: { not: null } },
  });
  skipped = alreadyTagged;

  console.log("\n[seed] Backfill breakdown:");
  for (const [k, v] of histogram) {
    console.log(`  • ${v} → ${k}`);
  }
  console.log(
    `  • already-tagged products (untouched): ${skipped}`,
  );

  console.log(
    `\n[seed] ${DRY_RUN ? "DRY-RUN — re-run with --apply to commit." : "Done."}`,
  );
  console.log(
    `[seed] Updated ${updated} products${DRY_RUN ? " (would update)" : ""}.`,
  );
  console.log("");
}

main()
  .catch((err) => {
    console.error("[seed] fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
