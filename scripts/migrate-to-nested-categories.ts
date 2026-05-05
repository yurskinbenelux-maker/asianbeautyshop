// ─────────────────────────────────────────────────────────────────────────
// scripts/migrate-to-nested-categories.ts
//
// One-time migration: reshape the flat 7-category structure into a nested
// 2-level tree (Categories → Subcategories) and re-tag existing products.
//
// Run modes:
//   pnpm tsx scripts/migrate-to-nested-categories.ts --dry-run
//     Print the plan, touch nothing.
//   pnpm tsx scripts/migrate-to-nested-categories.ts --apply
//     Commit the changes.
//   pnpm tsx scripts/migrate-to-nested-categories.ts --apply --archive-old
//     Also flips the legacy flat categories (Cleanser, Toner, etc.) to
//     isActive=false so they stop appearing in nav/filters. Safe to run
//     after Sofia has spot-checked the new assignments.
//
// What this script does:
//
//   1. Upserts every category in NEW_TREE with deterministic slugs.
//      Idempotent — running it twice is a no-op for the categories.
//
//   2. For each PUBLISHED + DRAFT product, reads its current
//      ProductCategory rows. Matches the legacy category name to a
//      parent group, then walks the product's name + INCI for keywords
//      that pin a specific subcategory. Falls back to the parent's
//      "default subcategory" when nothing matches.
//
//   3. Adds new ProductCategory rows for the chosen subcategory. We
//      DON'T remove the old assignments — old categories stay tagged so
//      the migration is non-destructive. Use --archive-old to hide
//      them from the nav after review.
//
//   4. Emits a CSV-style report to stdout: one line per product with
//      old categories, new subcategory, and a confidence note.
//
// Why this order: Sofia / Max can review the plan in dry-run, then
// apply it, then fix any wrong matches manually in /admin/products
// (drag-to-reassign), then archive the old categories once they're
// confident.
// ─────────────────────────────────────────────────────────────────────────

import { PrismaClient, Locale } from "@prisma/client";

const prisma = new PrismaClient();

// ────────── NEW_TREE — canonical taxonomy ────────────────────────────────
//
// Shape: each node has a slug + EN name + optional translations + optional
// list of children. Keywords on a leaf are used to match product names
// when auto-tagging — the more specific subcategories should come FIRST
// in the array so name patterns match the narrowest match (e.g. "cleansing
// balm" matches Cleansing Balms before generic "cleanser" matches Water
// Based Cleansers).
//
// Default subcategory: every parent has a `defaultSlug` — the fallback
// used when no keyword matches the product. Pick a sensible "catch-all"
// (e.g. Water Based Cleansers under Cleansers).

type Translations = Partial<Record<Locale, { name: string }>>;

type LeafNode = {
  slug: string;
  nameEn: string;
  translations?: Translations;
  /** Lowercased keywords that match product names / INCI. */
  keywords: string[];
};

type ParentNode = {
  slug: string;
  nameEn: string;
  translations?: Translations;
  /** Slugs from the legacy flat categories that map to this parent. */
  legacySlugs: string[];
  /** Subcategory slug to use when no keyword on a child matches. */
  defaultSlug: string;
  children: LeafNode[];
};

const NEW_TREE: ParentNode[] = [
  {
    slug: "cleansers",
    nameEn: "Cleansers",
    legacySlugs: ["cleanser", "cleansers"],
    defaultSlug: "water-based-cleansers",
    children: [
      {
        slug: "oil-cleansers",
        nameEn: "Oil Cleansers",
        keywords: ["oil cleanser", "cleansing oil"],
      },
      {
        slug: "cleansing-balms",
        nameEn: "Cleansing Balms",
        keywords: ["cleansing balm", "cleanser balm", "balm cleanser"],
      },
      {
        slug: "make-up-removers",
        nameEn: "Make-Up Removers",
        keywords: ["make-up remover", "makeup remover", "remover"],
      },
      {
        slug: "micellar-waters",
        nameEn: "Micellar Waters",
        keywords: ["micellar"],
      },
      {
        slug: "water-based-cleansers",
        nameEn: "Water Based Cleansers",
        keywords: ["foam", "gel cleanser", "low ph", "cleanser"], // catch-all order
      },
    ],
  },
  {
    slug: "toners",
    nameEn: "Toners",
    legacySlugs: ["toner", "toners"],
    defaultSlug: "hydrating-toners",
    children: [
      {
        slug: "exfoliating-toners",
        nameEn: "Exfoliating Toners",
        keywords: ["exfoliating", "aha", "bha", "pha", "acid toner"],
      },
      {
        slug: "calming-toners",
        nameEn: "Calming Toners",
        keywords: ["calming", "soothing", "centella", "cica"],
      },
      {
        slug: "mist-toners",
        nameEn: "Mist Toners",
        keywords: ["mist"],
      },
      {
        slug: "toner-pads",
        nameEn: "Toner Pads",
        keywords: ["pad", "pads"],
      },
      {
        slug: "hydrating-toners",
        nameEn: "Hydrating Toners",
        keywords: ["hydrating", "hyaluronic", "moisture toner", "toner"],
      },
    ],
  },
  {
    slug: "treatments",
    nameEn: "Treatments",
    legacySlugs: ["serum", "serums", "treatment", "treatments"],
    defaultSlug: "serums",
    children: [
      {
        slug: "ampoules",
        nameEn: "Ampoules",
        keywords: ["ampoule"],
      },
      {
        slug: "essences",
        nameEn: "Essences",
        keywords: ["essence"],
      },
      {
        slug: "spot-treatments",
        nameEn: "Spot Treatments",
        keywords: ["spot treatment", "spot patch", "blemish patch", "acne patch"],
      },
      {
        slug: "serums",
        nameEn: "Serums",
        keywords: ["serum"],
      },
    ],
  },
  {
    slug: "exfoliators",
    nameEn: "Exfoliators",
    legacySlugs: ["peeling", "peel", "exfoliator", "exfoliators"],
    defaultSlug: "chemical-exfoliators",
    children: [
      {
        slug: "physical-exfoliators",
        nameEn: "Physical Exfoliators",
        keywords: ["scrub", "physical exfoliator", "gommage"],
      },
      {
        slug: "chemical-exfoliators",
        nameEn: "Chemical Exfoliators",
        keywords: ["peel", "peeling", "aha", "bha", "pha", "glycolic", "lactic", "salicylic"],
      },
    ],
  },
  {
    slug: "moisturizers",
    nameEn: "Moisturizers",
    legacySlugs: ["cream", "creams", "moisturizer", "moisturisers", "moisturizers"],
    defaultSlug: "face-creams",
    children: [
      {
        slug: "gel-moisturizers",
        nameEn: "Gel Moisturizers",
        keywords: ["gel cream", "gel moisturiser", "gel moisturizer", "water cream"],
      },
      {
        slug: "facial-oils",
        nameEn: "Facial Oils",
        keywords: ["facial oil", "face oil"],
      },
      {
        slug: "emulsions",
        nameEn: "Emulsions",
        keywords: ["emulsion", "lotion", "milk"],
      },
      {
        slug: "face-creams",
        nameEn: "Face Creams",
        keywords: ["cream", "moisturiser", "moisturizer"],
      },
    ],
  },
  {
    slug: "masks",
    nameEn: "Masks",
    legacySlugs: ["mask", "masks"],
    defaultSlug: "wash-off-masks",
    children: [
      {
        slug: "sheet-masks",
        nameEn: "Sheet Masks",
        keywords: ["sheet mask"],
      },
      {
        slug: "sleeping-masks",
        nameEn: "Sleeping Masks",
        keywords: ["sleeping mask", "overnight mask"],
      },
      {
        slug: "peeling-masks",
        nameEn: "Peeling Masks",
        keywords: ["peeling mask", "peel mask"],
      },
      {
        slug: "wash-off-masks",
        nameEn: "Wash-Off Masks",
        keywords: ["wash-off", "wash off", "clay mask", "mask"],
      },
    ],
  },
  {
    slug: "lip-eye-care",
    nameEn: "Lip & Eye Care",
    legacySlugs: ["lip-eye-care", "eye-care", "lip-care"],
    defaultSlug: "eye-creams",
    children: [
      {
        slug: "eye-patches",
        nameEn: "Eye Patches",
        keywords: ["eye patch", "eye gel patch", "under-eye patch"],
      },
      {
        slug: "lip-care",
        nameEn: "Lip Care",
        keywords: ["lip mask", "lip balm", "lip oil", "lip"],
      },
      {
        slug: "eye-creams",
        nameEn: "Eye Creams",
        keywords: ["eye cream", "eye serum", "eye"],
      },
    ],
  },
  {
    slug: "sunscreens",
    nameEn: "Sunscreens",
    legacySlugs: ["spf", "sunscreen", "sunscreens"],
    defaultSlug: "sunscreens-default",
    // Single-leaf parent: we still create one child so the URL structure
    // stays consistent (/shop/category/sunscreens/sunscreens or whatever
    // the resolver decides).
    children: [
      {
        slug: "sunscreens-default",
        nameEn: "Sunscreens",
        keywords: ["spf", "sunscreen", "sun cream", "sun protect"],
      },
    ],
  },
];

// ────────── argv parsing ──────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");
const ARCHIVE_OLD = args.has("--archive-old");

if (DRY_RUN && !args.has("--dry-run")) {
  console.log(
    "[migrate] No mode flag passed. Defaulting to --dry-run. Pass --apply to commit.",
  );
}

// ────────── helpers ──────────────────────────────────────────────────────

function pickSubcategory(
  parent: ParentNode,
  haystack: string,
): { slug: string; matched: boolean; reason: string } {
  const lower = haystack.toLowerCase();
  for (const leaf of parent.children) {
    for (const kw of leaf.keywords) {
      if (lower.includes(kw)) {
        return { slug: leaf.slug, matched: true, reason: `keyword "${kw}"` };
      }
    }
  }
  return {
    slug: parent.defaultSlug,
    matched: false,
    reason: `default (no keyword match)`,
  };
}

// ────────── main ─────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n[migrate] Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY"}` +
      (ARCHIVE_OLD ? " · archive-old=ON" : ""),
  );

  // ── 1. Upsert new tree ───────────────────────────────────────────────
  console.log("\n[migrate] Step 1 — upsert NEW_TREE categories");
  // Map slug → resolved id, populated as we walk the tree.
  const slugToId = new Map<string, string>();

  for (let p = 0; p < NEW_TREE.length; p++) {
    const parent = NEW_TREE[p];
    const parentId = await upsertCategory({
      slug: parent.slug,
      nameEn: parent.nameEn,
      translations: parent.translations,
      parentId: null,
      sortOrder: p,
    });
    slugToId.set(parent.slug, parentId);

    for (let c = 0; c < parent.children.length; c++) {
      const child = parent.children[c];
      const childId = await upsertCategory({
        slug: child.slug,
        nameEn: child.nameEn,
        translations: child.translations,
        parentId,
        sortOrder: c,
      });
      slugToId.set(child.slug, childId);
    }
  }
  console.log(
    `[migrate]   ✓ ${slugToId.size} categories upserted (parents + leaves)`,
  );

  // ── 2. Read products + their current category names ─────────────────
  console.log("\n[migrate] Step 2 — fetch products + current categories");
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      sku: true,
      inciList: true,
      categories: {
        select: {
          category: { select: { id: true, slug: true } },
        },
      },
      translations: {
        where: { locale: Locale.EN },
        select: { name: true },
        take: 1,
      },
    },
  });
  console.log(`[migrate]   ✓ ${products.length} products to consider`);

  // ── 3. Match each product to a new subcategory ──────────────────────
  console.log("\n[migrate] Step 3 — compute new assignments");
  const assignments: Array<{
    productId: string;
    sku: string;
    productName: string;
    oldSlugs: string[];
    parentSlug: string | null;
    newSubSlug: string | null;
    matched: boolean;
    reason: string;
  }> = [];

  for (const prod of products) {
    const oldSlugs = prod.categories.map((c) => c.category.slug);
    const productName = prod.translations[0]?.name ?? prod.sku;
    const haystack = `${productName} ${prod.inciList ?? ""}`;

    // Find which NEW parent the product's old categories map to. If a
    // product is in multiple legacy categories that map to different
    // parents, we pick the first match — Sofia can reassign manually.
    let parent: ParentNode | null = null;
    for (const oldSlug of oldSlugs) {
      const found = NEW_TREE.find((p) =>
        p.legacySlugs.includes(oldSlug.toLowerCase()),
      );
      if (found) {
        parent = found;
        break;
      }
    }

    if (!parent) {
      // Product wasn't in any legacy category we know about. Try
      // matching the haystack against ALL parents' children directly.
      let bestMatch: { parent: ParentNode; sub: string; reason: string } | null = null;
      for (const candidate of NEW_TREE) {
        const m = pickSubcategory(candidate, haystack);
        if (m.matched) {
          bestMatch = { parent: candidate, sub: m.slug, reason: m.reason };
          break;
        }
      }
      if (bestMatch) {
        assignments.push({
          productId: prod.id,
          sku: prod.sku,
          productName,
          oldSlugs,
          parentSlug: bestMatch.parent.slug,
          newSubSlug: bestMatch.sub,
          matched: true,
          reason: bestMatch.reason + " (fallback name match)",
        });
      } else {
        assignments.push({
          productId: prod.id,
          sku: prod.sku,
          productName,
          oldSlugs,
          parentSlug: null,
          newSubSlug: null,
          matched: false,
          reason: "no parent + no keyword match — review manually",
        });
      }
      continue;
    }

    const sub = pickSubcategory(parent, haystack);
    assignments.push({
      productId: prod.id,
      sku: prod.sku,
      productName,
      oldSlugs,
      parentSlug: parent.slug,
      newSubSlug: sub.slug,
      matched: sub.matched,
      reason: sub.reason,
    });
  }

  // ── 4. Print the plan as CSV-ish for visual review ──────────────────
  console.log("\n[migrate] Step 4 — assignment report\n");
  console.log("SKU\tPRODUCT\tOLD_CATEGORIES\tNEW_PARENT\tNEW_SUB\tMATCH\tREASON");
  for (const a of assignments) {
    console.log(
      [
        a.sku,
        a.productName,
        a.oldSlugs.join("|") || "—",
        a.parentSlug ?? "—",
        a.newSubSlug ?? "—",
        a.matched ? "OK" : "REVIEW",
        a.reason,
      ].join("\t"),
    );
  }

  const reviewCount = assignments.filter((a) => !a.matched).length;
  console.log(
    `\n[migrate]   ${assignments.length - reviewCount} auto-matched, ${reviewCount} need manual review`,
  );

  // ── 5. Apply ────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log("\n[migrate] DRY-RUN — no writes. Re-run with --apply to commit.");
    return;
  }

  console.log("\n[migrate] Step 5 — adding new ProductCategory rows");
  let inserted = 0;
  for (const a of assignments) {
    if (!a.newSubSlug) continue;
    const newCatId = slugToId.get(a.newSubSlug);
    if (!newCatId) continue;
    try {
      await prisma.productCategory.create({
        data: { productId: a.productId, categoryId: newCatId },
      });
      inserted += 1;
    } catch (err: unknown) {
      // P2002 = already there, fine. Anything else worth surfacing.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        continue;
      }
      console.error(
        `[migrate]   ! failed for ${a.sku} → ${a.newSubSlug}:`,
        err,
      );
    }
  }
  console.log(`[migrate]   ✓ ${inserted} new ProductCategory rows inserted`);

  // ── 6. Optionally archive legacy flat categories ────────────────────
  if (ARCHIVE_OLD) {
    console.log("\n[migrate] Step 6 — archiving legacy flat categories");
    const legacySlugs = new Set(
      NEW_TREE.flatMap((p) => p.legacySlugs).map((s) => s.toLowerCase()),
    );
    const legacyCats = await prisma.category.findMany({
      where: { slug: { in: Array.from(legacySlugs) }, parentId: null },
      select: { id: true, slug: true },
    });
    // Skip any legacy slug that ALSO matches a new-tree slug (e.g.
    // "cleansers" exists in both lists if the legacy was already renamed).
    const newSlugs = new Set(
      NEW_TREE.flatMap((p) => [p.slug, ...p.children.map((c) => c.slug)]),
    );
    const toArchive = legacyCats.filter((c) => !newSlugs.has(c.slug));
    if (toArchive.length === 0) {
      console.log("[migrate]   ✓ nothing to archive");
    } else {
      const r = await prisma.category.updateMany({
        where: { id: { in: toArchive.map((c) => c.id) } },
        data: { isActive: false },
      });
      console.log(`[migrate]   ✓ archived ${r.count} legacy categories`);
    }
  }

  console.log("\n[migrate] done.");
}

// ────────── upsertCategory helper ────────────────────────────────────────

async function upsertCategory(opts: {
  slug: string;
  nameEn: string;
  translations?: Translations;
  parentId: string | null;
  sortOrder: number;
}): Promise<string> {
  if (DRY_RUN) {
    // Resolve to existing id if present so step-3 mapping still works.
    const existing = await prisma.category.findUnique({
      where: { slug: opts.slug },
      select: { id: true },
    });
    return existing?.id ?? "DRY-RUN-PENDING";
  }

  // Real upsert. Translation rows go via a nested upsert-each.
  const cat = await prisma.category.upsert({
    where: { slug: opts.slug },
    update: {
      parentId: opts.parentId,
      sortOrder: opts.sortOrder,
      isActive: true,
    },
    create: {
      slug: opts.slug,
      parentId: opts.parentId,
      sortOrder: opts.sortOrder,
      isActive: true,
    },
  });

  // Always (re-)set the EN name. Other locales: only set if provided
  // (don't overwrite Sofia's manual translations).
  await prisma.categoryTranslation.upsert({
    where: { categoryId_locale: { categoryId: cat.id, locale: Locale.EN } },
    update: { name: opts.nameEn },
    create: { categoryId: cat.id, locale: Locale.EN, name: opts.nameEn },
  });

  for (const [locale, payload] of Object.entries(opts.translations ?? {})) {
    if (!payload) continue;
    await prisma.categoryTranslation.upsert({
      where: {
        categoryId_locale: { categoryId: cat.id, locale: locale as Locale },
      },
      update: { name: payload.name },
      create: {
        categoryId: cat.id,
        locale: locale as Locale,
        name: payload.name,
      },
    });
  }

  return cat.id;
}

main()
  .catch((err) => {
    console.error("[migrate] fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
