// ─────────────────────────────────────────────────────────────────────────
// Homepage — assembles Hero B + bestsellers + ritual + testimonials +
// journal + newsletter. Each section is its own component so Sofia can
// reorder or A/B test later without touching this file much.
//
// Copy pipeline (since the /admin/homepage editor ships):
//   1. We fetch every admin-editable SiteCopy override for the homepage in
//      one query (`getSiteCopy`) — rows Sofia has saved win over the
//      `messages/{locale}.json` catalogue.
//   2. We resolve every field on the server (via `siteCopy()`) so the
//      client components just receive ready-to-render strings. Keeps the
//      client bundle lean and avoids passing the whole messages catalogue
//      across the RSC boundary.
// ─────────────────────────────────────────────────────────────────────────

import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomepageHero } from "@/components/home/homepage-hero";
import { HomepageVideoReel } from "@/components/home/homepage-video-reel";
import { Bestsellers } from "@/components/home/bestsellers";
import { YourRitual } from "@/components/home/your-ritual";
import { Testimonials } from "@/components/home/testimonials";
import { JournalTeaser } from "@/components/home/journal-teaser";
import { InstagramSection } from "@/components/home/instagram-section";
import { Newsletter } from "@/components/home/newsletter";
import { getSiteCopy, siteCopy, siteCopyOr } from "@/lib/queries/site-copy";
import { listActiveTestimonials } from "@/lib/queries/testimonial";
import { getInstagramTilesForHome } from "@/lib/queries/instagram";

type Props = { params: Promise<{ locale: string }> };

export default async function Home({ params }: Props) {
  const { locale } = await params;
  // Required for static rendering with next-intl
  setRequestLocale(locale);

  // One SiteCopy query covers every homepage section. Any fields Sofia hasn't
  // overridden come back empty and will fall back to t() below.
  const [copy, tHero, tSection, testimonials, instagramTiles] =
    await Promise.all([
      getSiteCopy(locale, [
        "home.hero",
        "home.bestsellers",
        "home.ritual",
        "home.testimonials",
        "home.journal",
        "home.newsletter",
      ]),
      getTranslations("hero"),
      getTranslations("section"),
      listActiveTestimonials(locale),
      getInstagramTilesForHome(),
    ]);

  // Resolve each section's strings once on the server — siteCopy() takes
  // (dict, section, field, translator) and returns override ?? translator(field).
  const heroCopy = {
    eyebrow: siteCopy(copy, "home.hero", "eyebrow", tHero),
    title_pre: siteCopy(copy, "home.hero", "title_pre", tHero),
    title_kr: siteCopy(copy, "home.hero", "title_kr", tHero),
    title_post: siteCopy(copy, "home.hero", "title_post", tHero),
    lede: siteCopy(copy, "home.hero", "lede", tHero),
    cta_primary: siteCopy(copy, "home.hero", "cta_primary", tHero),
    cta_secondary: siteCopy(copy, "home.hero", "cta_secondary", tHero),
  };

  // For the `section` namespace the JSON keys don't line up 1:1 with our
  // (section, field) schema — e.g. our "home.bestsellers::lede" maps to
  // `section.bestsellers_lede`. siteCopyOr() takes a literal fallback string
  // (we resolve the right t() value first) and — critically — still honours
  // the SITE_COPY_VOID sentinel, returning "" when Sofia has marked the
  // field hidden. Inline `?? tSection(...)` would have leaked the sentinel.
  const bestsellersCopy = {
    eyebrow: siteCopyOr(copy, "home.bestsellers", "eyebrow", tSection("bestsellers")),
    lede: siteCopyOr(copy, "home.bestsellers", "lede", tSection("bestsellers_lede")),
  };
  const ritualCopy = {
    eyebrow: siteCopyOr(copy, "home.ritual", "eyebrow", tSection("ritual")),
    lede: siteCopyOr(copy, "home.ritual", "lede", tSection("ritual_lede")),
  };
  const testimonialsCopy = {
    eyebrow: siteCopyOr(copy, "home.testimonials", "eyebrow", tSection("testimonials")),
    lede: siteCopyOr(copy, "home.testimonials", "lede", tSection("testimonials_lede")),
    verified: tSection("testimonial_verified"),
  };
  const journalCopy = {
    eyebrow: siteCopyOr(copy, "home.journal", "eyebrow", tSection("journal")),
    lede: siteCopyOr(copy, "home.journal", "lede", tSection("journal_lede")),
    read_all: siteCopyOr(copy, "home.journal", "read_all", tSection("journal_read_all")),
    coming_soon: tSection("journal_coming_soon"),
  };
  const newsletterCopy = {
    title: siteCopyOr(copy, "home.newsletter", "title", tSection("newsletter_title")),
    lede: siteCopyOr(copy, "home.newsletter", "lede", tSection("newsletter_lede")),
    cta: siteCopyOr(copy, "home.newsletter", "cta", tSection("newsletter_cta")),
    placeholder: siteCopyOr(
      copy,
      "home.newsletter",
      "placeholder",
      tSection("newsletter_placeholder"),
    ),
  };

  return (
    <>
      {/* Switchable hero: typography / video / collage. Variant picked
          in /admin/homepage/hero. Falls back to typography if the chosen
          variant has no usable assets. */}
      <HomepageHero copy={heroCopy} />
      {/* Optional editorial video reel — admin picks "off / single 16:9 /
          trio 9:16" in /admin/homepage. Self-hides when off or empty. */}
      <HomepageVideoReel />
      <Bestsellers locale={locale} copy={bestsellersCopy} />
      <YourRitual copy={ritualCopy} />
      <Testimonials copy={testimonialsCopy} items={testimonials} />
      <JournalTeaser locale={locale} copy={journalCopy} />
      {/* Curated Instagram grid — Sofia adds posts via
          /admin/marketing/instagram. Self-hides when the list is empty
          so a fresh install never shows a sad placeholder. */}
      <InstagramSection tiles={instagramTiles} />
      <Newsletter locale={locale} copy={newsletterCopy} />
    </>
  );
}
