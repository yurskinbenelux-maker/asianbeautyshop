// ─────────────────────────────────────────────────────────────────────────
// prisma/seed-journal.ts — seed 3 launch journal articles.
//
// Run with:
//   pnpm tsx prisma/seed-journal.ts
//
// Idempotent: upsert by JournalPost.id (deterministic UUIDs derived from
// slug) and PageTranslation [postId, locale]. Re-runs are safe; existing
// posts are updated with the latest body.
//
// We seed EN only — an admin can translate to NL/FR/RU through the admin
// rich-text editor as the brand grows. The infrastructure for translated
// posts is already there; this seed just gives the launch a starting
// point that doesn't read as "1 post, December 2025".
//
// Voice notes (so future articles match):
//   • Quiet, considered, editorial. Never marketing-y.
//   • Sentences are short but unhurried. No exclamation marks.
//   • First-person plural ("we", "our") — an admin + the brand together.
//   • Each piece links to 2-3 products in-line via /shop/<slug>. The
//     links don't shout "BUY NOW" — they're embedded the way a serious
//     magazine threads them.
//   • Headings sentence-cased. Korean words italicised on first use.
// ─────────────────────────────────────────────────────────────────────────

import { Locale, PostStatus, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

/** Deterministic UUID v5-style id from a slug, so re-runs upsert the
 *  same JournalPost row even on a fresh DB. */
function slugToId(slug: string): string {
  const hash = createHash("sha1").update(`yur-journal:${slug}`).digest("hex");
  // Format as a UUID. Bits aren't strictly v5-compliant — Postgres just
  // wants a valid UUID shape — but the deterministic property holds.
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "5" + hash.slice(13, 16),
    "8" + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

type Article = {
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  authorName: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  publishedAt: Date;
};

// ── Article 1 — ingredient deep-dive ─────────────────────────────────────
const NIACINAMIDE: Article = {
  slug: "niacinamide-the-quiet-workhorse",
  title: "Niacinamide, the quiet workhorse",
  excerpt:
    "Few ingredients earn their place on a label as consistently as niacinamide. Here's what it actually does — and what it can't.",
  coverUrl: null,
  authorName: "The Asian Beauty Shop team",
  publishedAt: new Date("2026-04-15T09:00:00Z"),
  seoTitle: "What does niacinamide do? — Asian Beauty Shop Journal",
  seoDescription:
    "A clear, evidence-led look at niacinamide (vitamin B3): what it does for sebum, redness, and barrier function — and the realistic limits of what one ingredient can deliver.",
  body: `
<p class="lede">Niacinamide is one of the few skincare actives that has held up across two decades of formulation trends. It rarely makes the front of a bottle. It shows up on most ingredient lists. There's a reason.</p>

<h2>What it actually is</h2>
<p>Niacinamide is the amide form of vitamin B3. Skin uses it as a precursor to the coenzymes NAD+ and NADP+, which sit at the centre of cellular energy and antioxidant defence. Topically, the molecule is small enough to penetrate the stratum corneum but stable enough that formulators can use it across pH ranges that would degrade more delicate actives like ascorbic acid.</p>
<p>Practically, this means it plays well with almost everything in a routine. You don't have to choose between it and your retinoid, your acid toner, or your peptide serum.</p>

<h2>What it does</h2>
<p>The literature converges on three meaningful effects at the 2–5% range typically used in K-beauty:</p>
<ul>
  <li><strong>Sebum modulation.</strong> Several controlled studies show a measurable reduction in sebum excretion rate after 4–6 weeks at 2%. Pores look less full because they are less full.</li>
  <li><strong>Barrier reinforcement.</strong> Niacinamide upregulates ceramide synthesis. Skin loses water more slowly and tolerates other actives better — which is part of why it pairs so well with retinol.</li>
  <li><strong>Pigmentation.</strong> It interrupts the transfer of melanosomes from melanocytes to keratinocytes. Existing pigment fades slowly; new pigment forms more reluctantly.</li>
</ul>

<h2>What it can't do</h2>
<p>Niacinamide is not a substitute for sunscreen, an exfoliant, or a retinoid. It will not undo years of UV damage in six weeks. It will not make a dehydrated skin look plump if the routine is missing humectants and occlusives further down the layering order. We mention this because the ingredient is sometimes marketed as a one-shot answer, and it isn't — even very good actives are part of a system.</p>

<h2>Where you'll find it in the Asian Beauty Shop catalogue</h2>
<p>We use niacinamide across most of the Yu.R Pro line at concentrations between 2% and 4%. Two pieces stand out for first-time users: the <a href="/shop/24k-gold-ampoule">24K Gold Ampoule</a>, which leans on niacinamide alongside copper tripeptide-1 for a slow-build glow, and the <a href="/shop/dd-cream">DD Cream</a>, which uses it as a barrier-repair backbone underneath the daytime tint.</p>

<h2>How to introduce it</h2>
<p>Most skin tolerates niacinamide on day one, but a small minority of barrier-disrupted skin (often the kind already overusing acids or retinol) flushes briefly. If that's you, skip the toner and apply on bare clean skin every other evening for the first week, then build up. Reactions that don't resolve in a few days usually point to a sensitivity to a co-formulant — fragrance is the usual culprit — not niacinamide itself.</p>

<p class="signoff">— The team</p>
`.trim(),
};

// ── Article 2 — ritual guide ─────────────────────────────────────────────
const EVENING_RITUAL: Article = {
  slug: "the-evening-ritual-simplified",
  title: "The evening ritual, simplified",
  excerpt:
    "The 10-step Korean routine made the rounds, then quietly receded. Here's the version we actually use.",
  coverUrl: null,
  authorName: "The Asian Beauty Shop team",
  publishedAt: new Date("2026-03-28T09:00:00Z"),
  seoTitle: "Korean evening skincare routine, simplified — Asian Beauty Shop Journal",
  seoDescription:
    "The Korean evening routine condensed to five honest steps: cleanse, tone, treat, moisturise, occlude. What each step does and what to skip.",
  body: `
<p class="lede">The 10-step routine was a marketing artefact. Most Korean estheticians do five steps in the evening and call it done. Here's the version we layer ourselves.</p>

<h2>1. Cleanse, twice if needed</h2>
<p>If you wore SPF or makeup, an oil cleanser comes first. Massage onto dry skin for thirty seconds, emulsify with water, rinse. Follow with a low-pH water cleanser to clear the surface of any residue. If your day was bare-skinned, the second cleanse alone is enough — you don't owe your face the full ritual every night.</p>

<h2>2. Tone — but think hydrating, not stripping</h2>
<p>The Western "toner" inheritance is alcohol-based and astringent. Korean toners are the opposite: humectant-loaded, low-pH, designed to rebalance after cleansing and prime the skin to accept what comes next. Press, don't wipe, with clean palms.</p>

<h2>3. Treat — one active at a time</h2>
<p>This is the layer where the brief lives. If you're targeting fine lines, a peptide ampoule. Pigment, an antioxidant. Texture, a gentle <em>peeling</em> on alternate evenings. The mistake people make is stacking three actives the same night and then wondering why their barrier is wrecked. Pick one. The <a href="/shop/24k-gold-ampoule">24K Gold Ampoule</a> sits in this slot for many of our customers — it's quiet enough to use nightly without rotation.</p>

<h2>4. Moisturise — the right texture for the season</h2>
<p>In summer, an emulsion or light cream is enough. In winter, layer a richer cream on top. We don't separately apply "essence" and "lotion" the way the canonical 10-step does — modern Korean creams already incorporate that hydration. The <a href="/shop/face-cream-yur">Face Cream</a> is what we'd reach for as a year-round default.</p>

<h2>5. Occlude — the step everyone skips</h2>
<p>Particularly in the colder months, finish with a thin layer of an occlusive — a balm, a sleeping mask, a few drops of a non-comedogenic facial oil. This is the step that locks in everything underneath and lets your skin actually use it overnight. Skip it and your treatment products evaporate as fast as they were applied.</p>

<h2>Cadence, not perfection</h2>
<p>Five steps, four times a week, is better than ten steps three times a year. Skincare is one of the few wellness disciplines where consistency genuinely outperforms intensity. We'd rather you hit the basics nightly than chase the perfect routine on Sundays.</p>

<p class="signoff">— The team</p>
`.trim(),
};

// ── Article 3 — skin-concern explainer ───────────────────────────────────
const HYDRATION_VS_MOISTURE: Article = {
  slug: "hydration-vs-moisture",
  title: "Hydration vs moisture, and why it matters",
  excerpt:
    "These two words get used interchangeably and they shouldn't. Knowing the difference reorganises a routine.",
  coverUrl: null,
  authorName: "The Asian Beauty Shop team",
  publishedAt: new Date("2026-02-19T09:00:00Z"),
  seoTitle: "Hydration vs moisture in skincare — Asian Beauty Shop Journal",
  seoDescription:
    "Dehydrated skin needs water; dry skin needs lipids. Why the routines for each are different, and how to tell which one you actually have.",
  body: `
<p class="lede">If you've ever applied a heavy cream to skin that still feels tight by lunchtime, you've felt the difference. Cream isn't always what's missing.</p>

<h2>Two different problems</h2>
<p>Skin can lack water (<em>dehydration</em>) or lipids (<em>dryness</em>). They sound like synonyms; they aren't.</p>
<ul>
  <li><strong>Dehydrated skin</strong> is a <em>condition</em>. It can affect any skin type, including oily skin. The complaint is tightness, dullness, fine surface lines that fade after washing then come back. The deficit is water.</li>
  <li><strong>Dry skin</strong> is a <em>type</em>. It's a permanent tendency to produce less sebum than the skin needs to maintain its barrier. The complaint is flakiness, sensitivity, often eczema-adjacent reactivity. The deficit is fats.</li>
</ul>
<p>Most adults we meet are dehydrated. A smaller, more constitutional group is genuinely dry. A surprising number are both.</p>

<h2>How to tell which you have</h2>
<p>A useful five-minute test: cleanse, pat dry, do nothing for ten minutes. Then watch.</p>
<p>If your skin starts to look slightly oily across the T-zone before the ten minutes are up, you produce sebum normally — what feels tight earlier was thirst, not lipid loss. You're dehydrated, not dry. If your skin still feels tight, papery, and matte at the ten-minute mark, lipids are running low. You're dry.</p>

<h2>The routines diverge</h2>
<p>For dehydration, the answer is humectants — ingredients that pull water into the skin and hold it there. Sodium hyaluronate, glycerin, beta-glucan, polyglutamic acid. Layer these in low-viscosity formats: a hydrating <a href="/shop/toner-yur">toner</a>, a watery essence, a gel-textured serum. Then top with a light occlusive to keep the water from leaving.</p>
<p>For dryness, the answer is lipids — ceramides, fatty acids, squalane, plant butters. These come in heavier vehicles: rich creams, balms, facial oils. Hydration alone won't fix dryness; you need to add fats back.</p>

<h2>If you're both</h2>
<p>Treat the dehydration first. It's faster to fix and the lipid step works better on already-saturated skin. A typical sequence we'd suggest: hydrating toner, peptide or hyaluronic ampoule, light cream, finishing balm or oil. The whole layering takes three minutes once you're used to it.</p>

<h2>The mistake to avoid</h2>
<p>Don't reach for the richest cream you can find when your skin feels tight. If the underlying problem is dehydration, sealing dry, water-poor skin under occlusives can make the surface feel softer for an hour and look duller for a week. Add water before you add fats. Always.</p>

<p class="signoff">— The team</p>
`.trim(),
};

const ARTICLES: Article[] = [NIACINAMIDE, EVENING_RITUAL, HYDRATION_VS_MOISTURE];

async function main() {
  console.log("📓  Seeding journal articles …");
  for (const a of ARTICLES) {
    const id = slugToId(a.slug);

    await prisma.journalPost.upsert({
      where: { id },
      update: {
        status: PostStatus.PUBLISHED,
        publishedAt: a.publishedAt,
        coverUrl: a.coverUrl,
        authorName: a.authorName,
      },
      create: {
        id,
        status: PostStatus.PUBLISHED,
        publishedAt: a.publishedAt,
        coverUrl: a.coverUrl,
        authorName: a.authorName,
      },
    });

    await prisma.journalPostTranslation.upsert({
      where: {
        postId_locale: { postId: id, locale: Locale.EN },
      },
      update: {
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        body: a.body,
        seoTitle: a.seoTitle,
        seoDescription: a.seoDescription,
      },
      create: {
        postId: id,
        locale: Locale.EN,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        body: a.body,
        seoTitle: a.seoTitle,
        seoDescription: a.seoDescription,
      },
    });

    console.log(`   ✓ ${a.slug}`);
  }
  console.log("\n✅  Done.  3 EN articles upserted.");
  console.log(
    "   NL / FR / RU translations remain blank — fill them via /admin/journal as the brand grows.",
  );
}

main()
  .catch((err) => {
    console.error("❌  Seed failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
