// ─────────────────────────────────────────────────────────────────────────
// scripts/seed-quiz-taxonomies.ts
//
// Phase 0 of the AI-admin feature — populates SkinType / Concern /
// Benefit tables so the AI categorize button has real pills to pick
// from. Without this seed, the Organise tab on every product shows
// "0 / 0 selected" because the taxonomy tables are empty even though
// the schema exists.
//
// Why these specific values:
//   · Skin types + Concerns mirror the live skin quiz constants
//     (src/lib/ai/quiz.ts) — that way one customer journey (quiz →
//     recommendation) and one admin journey (categorize product) use
//     the SAME taxonomy and Sofia can't accidentally diverge them.
//
//   · Benefits are NOT in the quiz (the quiz reasons over concerns,
//     not benefit promises) so we seed a tight set of 10 conventional
//     benefit values that map cleanly to the concerns. Sofia can add
//     more later via the inline-create on the Organise tab.
//
// Idempotent: upserts by slug, sets EN translation label only.
// Re-running is a no-op. Other locales (NL/FR/RU) are NOT seeded;
// when Sofia opens the Organise tab she'll see the EN labels — that's
// fine because the translations for these taxonomy labels are needed
// only on the customer-facing /shop sidebar, which already falls
// back to EN if a locale is missing.
//
// Run:
//   pnpm tsx scripts/seed-quiz-taxonomies.ts --dry-run
//   pnpm tsx scripts/seed-quiz-taxonomies.ts --apply
// ─────────────────────────────────────────────────────────────────────────

import { PrismaClient, Locale } from "@prisma/client";

const prisma = new PrismaClient();

const DRY_RUN = !process.argv.includes("--apply");

// ── Skin types — verbatim from quiz Q1 ──────────────────────────────────
const SKIN_TYPES: Array<{ slug: string; label: string }> = [
  { slug: "dry", label: "Dry" },
  { slug: "combo", label: "Combination" },
  { slug: "oily", label: "Oily" },
  { slug: "sensitive", label: "Sensitive" },
  { slug: "normal", label: "Normal" },
];

// ── Concerns — quiz Q2 (primary) + Q3 (secondary), deduplicated ─────────
// Order is "most-asked first" so chips on the Organise tab read top-to-
// bottom in roughly clinical priority. Sofia can re-order via sortOrder
// later if needed (Concern doesn't have sortOrder yet — would be a
// schema change).
const CONCERNS: Array<{ slug: string; label: string }> = [
  // Primary concerns from quiz Q2
  { slug: "hydration", label: "Hydration" },
  { slug: "dullness", label: "Dullness" },
  { slug: "acne", label: "Acne / breakouts" },
  { slug: "fine-lines", label: "Fine lines" },
  { slug: "dark-spots", label: "Dark spots" },
  { slug: "pores", label: "Pores" },
  { slug: "redness", label: "Redness" },
  // Secondary concerns from quiz Q3
  { slug: "tightness", label: "Tightness" },
  { slug: "texture", label: "Texture" },
  { slug: "dark-circles", label: "Dark circles" },
  { slug: "sun-damage", label: "Sun damage" },
  { slug: "firmness", label: "Firmness" },
  { slug: "sensitive-eyes", label: "Sensitive eyes" },
];

// ── Benefits — what a product PROMISES (verb tense). 10 conventional
// values that map 1:1 to the concerns above. Distinct axis from
// concerns — concerns are problems, benefits are outcomes. Sofia can
// add more via inline-create on the Organise tab when needed.
const BENEFITS: Array<{ slug: string; label: string }> = [
  { slug: "hydrating", label: "Hydrating" },
  { slug: "brightening", label: "Brightening" },
  { slug: "calming", label: "Calming" },
  { slug: "exfoliating", label: "Exfoliating" },
  { slug: "firming", label: "Firming" },
  { slug: "oil-control", label: "Oil control" },
  { slug: "protecting", label: "Protecting (SPF)" },
  { slug: "nourishing", label: "Nourishing" },
  { slug: "clarifying", label: "Clarifying" },
  { slug: "plumping", label: "Plumping" },
];

async function main() {
  console.log(`\n[seed] Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY"}\n`);

  // ── Skin types ────────────────────────────────────────────────────
  console.log(`[seed] SkinType (${SKIN_TYPES.length} rows)`);
  for (const s of SKIN_TYPES) {
    if (DRY_RUN) {
      const existing = await prisma.skinType.findUnique({
        where: { slug: s.slug },
      });
      console.log(`  • ${s.label} (${s.slug}) — ${existing ? "exists" : "would create"}`);
    } else {
      const row = await prisma.skinType.upsert({
        where: { slug: s.slug },
        update: {},
        create: { slug: s.slug },
      });
      await prisma.skinTypeTranslation.upsert({
        where: {
          skinTypeId_locale: { skinTypeId: row.id, locale: Locale.EN },
        },
        update: { label: s.label },
        create: { skinTypeId: row.id, locale: Locale.EN, label: s.label },
      });
      console.log(`  • ${s.label} (${s.slug}) ✓`);
    }
  }

  // ── Concerns ──────────────────────────────────────────────────────
  console.log(`\n[seed] Concern (${CONCERNS.length} rows)`);
  for (const c of CONCERNS) {
    if (DRY_RUN) {
      const existing = await prisma.concern.findUnique({
        where: { slug: c.slug },
      });
      console.log(`  • ${c.label} (${c.slug}) — ${existing ? "exists" : "would create"}`);
    } else {
      const row = await prisma.concern.upsert({
        where: { slug: c.slug },
        update: {},
        create: { slug: c.slug },
      });
      await prisma.concernTranslation.upsert({
        where: {
          concernId_locale: { concernId: row.id, locale: Locale.EN },
        },
        update: { label: c.label },
        create: { concernId: row.id, locale: Locale.EN, label: c.label },
      });
      console.log(`  • ${c.label} (${c.slug}) ✓`);
    }
  }

  // ── Benefits ──────────────────────────────────────────────────────
  console.log(`\n[seed] Benefit (${BENEFITS.length} rows)`);
  for (const b of BENEFITS) {
    if (DRY_RUN) {
      const existing = await prisma.benefit.findUnique({
        where: { slug: b.slug },
      });
      console.log(`  • ${b.label} (${b.slug}) — ${existing ? "exists" : "would create"}`);
    } else {
      const row = await prisma.benefit.upsert({
        where: { slug: b.slug },
        update: {},
        create: { slug: b.slug },
      });
      await prisma.benefitTranslation.upsert({
        where: {
          benefitId_locale: { benefitId: row.id, locale: Locale.EN },
        },
        update: { label: b.label },
        create: { benefitId: row.id, locale: Locale.EN, label: b.label },
      });
      console.log(`  • ${b.label} (${b.slug}) ✓`);
    }
  }

  console.log(
    `\n[seed] ${DRY_RUN ? "DRY-RUN — re-run with --apply to commit." : "Done."}\n`,
  );
}

main()
  .catch((err) => {
    console.error("[seed] fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
