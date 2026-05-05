// ─────────────────────────────────────────────────────────────────────────
// scripts/cleanup-category-artifacts.ts
//
// Post-migration cleanup. The verify script flagged two artifacts:
//
//   1. `essences-2` — a pre-existing duplicate of "Essences" that the
//      migration didn't touch (it upserted slug `essences` cleanly, but
//      the second copy at slug `essences-2` was orphaned). Re-tag any
//      products still on it to the canonical Treatments → Essences,
//      then delete the row.
//
//   2. `sunscreens-default` — the migration's child of "Sunscreens" got
//      slug `-default` because `sunscreens` was already taken by the
//      parent. The label "Sunscreens > Sunscreens" reads weird. Rename
//      the child to "Face Sunscreens" (slug `face-sunscreens`) so the
//      mega-menu shows a meaningful sub.
//
// Run modes:
//   pnpm tsx scripts/cleanup-category-artifacts.ts --dry-run
//   pnpm tsx scripts/cleanup-category-artifacts.ts --apply
// ─────────────────────────────────────────────────────────────────────────

import { PrismaClient, Locale } from "@prisma/client";

const prisma = new PrismaClient();

const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  console.log(
    `\n[cleanup] Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY"}\n`,
  );

  // ── 1. essences-2 → re-tag products + delete row ──────────────────────
  const stray = await prisma.category.findUnique({
    where: { slug: "essences-2" },
    include: {
      products: { select: { productId: true } },
    },
  });
  const canonical = await prisma.category.findUnique({
    where: { slug: "essences" },
    select: { id: true, parentId: true },
  });

  if (!stray) {
    console.log("[cleanup] 1 · essences-2 not found — already cleaned ✓");
  } else if (!canonical) {
    console.log(
      "[cleanup] 1 · ⚠ canonical 'essences' (Treatments child) missing!",
    );
    console.log("            Skipping — re-run the migration first.");
  } else {
    console.log(
      `[cleanup] 1 · essences-2 found, ${stray.products.length} products tagged.`,
    );
    if (!canonical.parentId) {
      console.log(
        "            ⚠ canonical 'essences' has no parentId — it's not nested.",
      );
      console.log(
        "            That suggests the migration didn't fully apply. Skipping.",
      );
    } else {
      // Re-tag — connectOrCreate to skip products already on canonical.
      for (const link of stray.products) {
        if (DRY_RUN) {
          console.log(
            `            would re-tag product ${link.productId} → essences`,
          );
        } else {
          try {
            await prisma.productCategory.create({
              data: { productId: link.productId, categoryId: canonical.id },
            });
            console.log(`            re-tagged ${link.productId} → essences`);
          } catch (e: unknown) {
            // P2002 = already on the canonical, fine to skip
            const code = (e as { code?: string }).code;
            if (code === "P2002") {
              console.log(
                `            ${link.productId} already on essences — skip`,
              );
            } else {
              throw e;
            }
          }
        }
      }
      // Delete stray row (cascades to ProductCategory + CategoryTranslation
      // via the schema's onDelete: Cascade).
      if (DRY_RUN) {
        console.log("            would delete essences-2");
      } else {
        await prisma.category.delete({ where: { id: stray.id } });
        console.log("            deleted essences-2 ✓");
      }
    }
  }

  // ── 2. sunscreens-default → rename to face-sunscreens ─────────────────
  const sunChild = await prisma.category.findUnique({
    where: { slug: "sunscreens-default" },
    include: {
      translations: true,
    },
  });

  if (!sunChild) {
    console.log(
      "\n[cleanup] 2 · sunscreens-default not found — already renamed ✓",
    );
  } else {
    console.log("\n[cleanup] 2 · renaming sunscreens-default → face-sunscreens");
    if (DRY_RUN) {
      console.log("            would rename slug + EN label");
    } else {
      await prisma.category.update({
        where: { id: sunChild.id },
        data: { slug: "face-sunscreens" },
      });
      // Update EN translation label only — leave NL/FR/RU for Sofia
      // unless they're still the auto-generated stub.
      await prisma.categoryTranslation.update({
        where: {
          categoryId_locale: {
            categoryId: sunChild.id,
            locale: Locale.EN,
          },
        },
        data: { name: "Face Sunscreens" },
      });
      console.log("            renamed ✓");
    }
  }

  console.log(
    `\n[cleanup] ${DRY_RUN ? "DRY-RUN — re-run with --apply to commit." : "Done."}\n`,
  );
}

main()
  .catch((err) => {
    console.error("[cleanup] fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
