// ─────────────────────────────────────────────────────────────────────────
// /[locale]/brands/[slug]/about — dedicated editorial page for one brand.
//
// Distinct from /shop/brand/[slug] which is the FILTERED PRODUCT LISTING
// for that brand (with sidebar filters + grid). This page is purely
// editorial: cover photo (or typographic fallback), display-type heading,
// tagline eyebrow, prose story, and a CTA back to the listing.
//
// aboutFromBrandId resolution happens in the query layer
// (getBrandAboutBySlug) so when a sub-brand inherits content from a
// canonical parent, this page just renders whatever the query returns —
// no logic here needs to know about the inheritance.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import {
  getBrandAboutBySlug,
  getBrandFamilySlugs,
} from "@/lib/queries/products";
import { buildPageMetadata } from "@/lib/seo/metadata";

// ISR — 5 minutes matches /shop and category landings. About content
// changes rarely; admin edits propagate within 5 minutes.
export const revalidate = 300;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const brand = await getBrandAboutBySlug(locale, slug);
  if (!brand) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  // Description prefers the brand's tagline (short, marketing-ready) and
  // falls back to a stripped-HTML preview of the story. Either way the
  // brand name leads.
  const description =
    brand.tagline ?? stripHtml(brand.story) ?? undefined;

  return buildPageMetadata({
    locale,
    tail: `/brands/${brand.slug}/about`,
    title: `About ${brand.name}`,
    description,
    ogImage: brand.coverImageUrl ?? undefined,
  });
}

export default async function BrandAboutPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  // Brand content + the family of brands sharing this About page run in
  // parallel — the family slugs power the CTA so when Yu.R Me is the
  // displayed brand, "Browse Yu.R Me products" actually lands on /shop
  // with all three Yu.R-house brands pre-filtered.
  const [brand, familySlugs] = await Promise.all([
    getBrandAboutBySlug(locale, slug),
    getBrandFamilySlugs(slug),
  ]);
  if (!brand) notFound();

  const tBrand = await getTranslations("brand");

  // Build the CTA destination. Multi-brand families deep-link to /shop
  // with the multi-brand filter pre-applied; single-brand families fall
  // through to the dedicated /shop/brand/[slug] landing page (which is
  // editorially nicer than a /shop?brand=one URL).
  const browseHref =
    familySlugs.length > 1
      ? `/shop?brand=${familySlugs.join(",")}`
      : `/shop/brand/${brand.slug}`;

  return (
    <article className="pb-20">
      {/* ── Hero ──────────────────────────────────────────────────────
          Letterbox cover photo capped at ~50vh so the prose is reachable
          in a single scroll. Earlier 21:9 ratio looked editorial on its
          own but pushed the brand name + lede off the fold on most
          desktop screens. */}
      {brand.coverImageUrl ? (
        <div className="relative aspect-[16/8] max-h-[55vh] w-full overflow-hidden bg-rice-dim/40 md:aspect-[12/5]">
          <Image
            src={brand.coverImageUrl}
            alt={`${brand.name} cover`}
            fill
            sizes="100vw"
            className="object-cover"
            // Inline `objectPosition` so the focal point picked in
            // /admin/categories/brands/[id] anchors the letterbox crop.
            // Default is "center center" when the column is null.
            style={{ objectPosition: brand.coverPosition }}
            priority
          />
        </div>
      ) : (
        <div className="container py-20 md:py-28">
          <div className="text-[11px] uppercase tracking-label text-vermilion">
            {tBrand("about_eyebrow")}
          </div>
        </div>
      )}

      {/* ── Editorial body ────────────────────────────────────────
          max-w-2xl gives a comfortable measure (~65 chars) for long-form
          reading. The earlier max-w-3xl pushed lines past 80 chars on
          wide displays which felt like a print catalogue, not a brand
          essay. */}
      <div className="container max-w-2xl">
        <header
          className={brand.coverImageUrl ? "mt-12 md:mt-16" : "-mt-10"}
        >
          {brand.coverImageUrl && (
            <div className="text-[11px] uppercase tracking-label text-vermilion">
              {tBrand("about_eyebrow")}
            </div>
          )}
          <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
            {brand.name}
          </h1>
          {brand.tagline && (
            <p className="mt-4 text-[18px] italic leading-relaxed text-ink">
              {brand.tagline}
            </p>
          )}
          {/* Inheritance signal intentionally NOT rendered for customers
              — admins see it in /admin/categories/brands/[id]; surfacing
              "About sourced from Yu.R" on the public page exposed an
              implementation detail and broke the editorial illusion. */}
        </header>

        {brand.story ? (
          <div
            // Custom prose styling on the .brand-story class (defined in
            // globals.css) — opt out of the default `prose` plugin
            // because its defaults clashed with the K-ink palette and
            // produced the "everything looks like one paragraph" issue.
            // Headings get vermilion small-caps treatment, lists get
            // vermilion markers, paragraphs get generous spacing, so
            // admin-authored Tiptap HTML renders cleanly without
            // requiring perfect markup discipline.
            className="brand-story mt-12 text-[16px] leading-[1.8] text-ink-mid"
            dangerouslySetInnerHTML={{ __html: brand.story }}
          />
        ) : (
          <p className="mt-10 text-[14px] leading-relaxed text-ink-mid">
            {tBrand("about_empty")}
          </p>
        )}

        {/* ── Certifications grid ─────────────────────────────────
            Authored as `CODE | description` lines in admin and
            persisted as JSONB. Renders as a 2-column responsive grid
            so the page gets a scannable trust block — same visual
            language as PDP ingredient strips (compact eyebrow code +
            short prose explanation). Hidden when none authored. */}
        {brand.certifications.length > 0 && (
          <section className="mt-16 border-t border-ink/10 pt-10">
            <h2 className="text-[11px] uppercase tracking-label text-vermilion">
              {tBrand("about_certifications")}
            </h2>
            <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              {brand.certifications.map((c) => (
                <div
                  key={`${c.code}-${c.description}`}
                  className="border-l-2 border-vermilion/40 pl-4"
                >
                  <dt className="font-display text-[15px] leading-tight text-ink">
                    {c.code || c.description}
                  </dt>
                  {c.code && c.description && (
                    <dd className="mt-1 text-[13px] leading-relaxed text-ink-mid">
                      {c.description}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* ── Safety / usage callout ──────────────────────────────
            Soft callout box for pregnancy/breastfeeding warnings,
            allergy notices, or patch-test guidance. Visually distinct
            from prose — sage left border + warm cream background — so
            customers don't miss it but it doesn't shout. */}
        {brand.safetyNote && (
          <aside
            role="note"
            className="mt-12 border-l-2 border-sage bg-sage/5 px-5 py-4 text-[14px] leading-relaxed text-ink"
          >
            <div className="text-[10px] uppercase tracking-label text-sage">
              {tBrand("about_safety_note")}
            </div>
            <p className="mt-2 whitespace-pre-line">{brand.safetyNote}</p>
          </aside>
        )}

        <div className="mt-16 border-t border-ink/10 pt-10">
          <Link
            href={browseHref}
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-3 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-ink/90"
          >
            {tBrand("about_browse_cta", { name: brand.name })}
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Strip HTML tags + clip to ~160 chars for meta descriptions. Same util
 *  as the brand landing page — kept inline rather than shared because
 *  the use site is one line and shared SEO utilities live elsewhere. */
function stripHtml(html: string | null): string | undefined {
  if (!html) return undefined;
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return undefined;
  return plain.length > 160 ? `${plain.slice(0, 157).trimEnd()}…` : plain;
}
