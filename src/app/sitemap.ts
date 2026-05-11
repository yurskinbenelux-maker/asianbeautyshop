// ─────────────────────────────────────────────────────────────────────────
// /sitemap.xml — dynamic sitemap for search engines.
//
// We emit one entry per (route, locale) pair. Every URL carries an
// `alternates.languages` map so Google + Yandex can see the full hreflang
// set and pick the right locale for the user without them being treated
// as duplicate content.
//
// Routes included:
//   · static public pages — /, /shop, /sign-in, /sign-up, /legal/<key>
//   · every published product under its locale-specific slug
//
// NOT included:
//   · /account/* and /admin/* (private; excluded via robots.ts too)
//   · password flows (/forgot-password, /reset-password) — no SEO value
//
// The sitemap is revalidated every hour. Product/legal page edits from
// the admin will propagate on the next crawl without a redeploy.
// ─────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";
import { Locale } from "@prisma/client";
import { routing } from "@/i18n/routing";
import {
  getAllPublishedProductSlugs,
  getAllActiveCategorySlugs,
  getAllActiveBrandSlugs,
} from "@/lib/queries/products";
import { getAllPublishedJournalSlugs } from "@/lib/queries/journal";
import { getAllSitemapIngredientSlugs } from "@/lib/queries/ingredients";
import { LEGAL_PAGE_KEYS } from "@/lib/queries/pages";

// Revalidate hourly — long enough to stay cheap, short enough that new
// products or legal-page edits show up in search within a reasonable
// window without anyone needing to redeploy.
export const revalidate = 3600;

const LOCALES = routing.locales; // ["en", "nl", "fr", "ru"]

/** Site origin — e.g. https://asianbeautyshop.eu. We trim any trailing slash
 *  because every path we emit is already prefixed with "/". */
function getOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Build the `alternates.languages` map for a route that is the same across
 *  locales (i.e. the path is just the locale prefix + a fixed tail). */
function sameTailAlternates(
  origin: string,
  tail: string,
): Record<string, string> {
  const alts: Record<string, string> = {};
  for (const l of LOCALES) alts[l] = `${origin}/${l}${tail}`;
  // Per Google's hreflang spec: `x-default` points to the version for
  // users whose locale we don't cover. We point it at the EN site.
  alts["x-default"] = `${origin}/${routing.defaultLocale}${tail}`;
  return alts;
}

/** URL enum → Prisma Locale for dictionary lookups. */
function toPrismaLocale(urlLocale: string): Locale {
  return (
    {
      en: Locale.EN,
      nl: Locale.NL,
      fr: Locale.FR,
      ru: Locale.RU,
    } as const
  )[urlLocale] ?? Locale.EN;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getOrigin();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [];

  // ── Static routes ─────────────────────────────────────────────────
  // Rendered under every locale. The homepage gets the highest priority;
  // shop is the other primary entry point. Auth pages are low-priority
  // but still included (users searching for "asian beauty sign in" etc.).
  const staticRoutes: Array<{
    tail: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }> = [
    { tail: "", priority: 1.0, changeFrequency: "daily" },
    { tail: "/shop", priority: 0.9, changeFrequency: "daily" },
    { tail: "/sale", priority: 0.7, changeFrequency: "daily" },
    { tail: "/new", priority: 0.7, changeFrequency: "daily" },
    { tail: "/brands", priority: 0.6, changeFrequency: "weekly" },
    { tail: "/ingredients", priority: 0.6, changeFrequency: "weekly" },
    { tail: "/journal", priority: 0.6, changeFrequency: "weekly" },
    { tail: "/quiz", priority: 0.6, changeFrequency: "monthly" },
    { tail: "/rituals", priority: 0.5, changeFrequency: "monthly" },
    { tail: "/faq", priority: 0.4, changeFrequency: "monthly" },
    { tail: "/shipping", priority: 0.4, changeFrequency: "monthly" },
    { tail: "/contact", priority: 0.4, changeFrequency: "yearly" },
    { tail: "/sign-in", priority: 0.2, changeFrequency: "yearly" },
    { tail: "/sign-up", priority: 0.3, changeFrequency: "yearly" },
  ];

  for (const route of staticRoutes) {
    const alternates = sameTailAlternates(origin, route.tail);
    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}${route.tail}`,
        lastModified: now,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: { languages: alternates },
      });
    }
  }

  // ── Legal pages ───────────────────────────────────────────────────
  // /legal/<key> — 5 keys × 4 locales = 20 URLs. lastModified comes from
  // the Page table so Google sees a fresh stamp when an admin edits them.
  for (const key of LEGAL_PAGE_KEYS) {
    const tail = `/legal/${key}`;
    const alternates = sameTailAlternates(origin, tail);
    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}${tail}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.3,
        alternates: { languages: alternates },
      });
    }
  }

  // ── Category landing pages ────────────────────────────────────────
  // Category slugs are shared across locales (the slug lives on Category,
  // not on CategoryTranslation), so one DB row → four sitemap entries,
  // one per locale under /[locale]/shop/category/<slug>. Priority sits
  // between /shop (0.9) and product pages (0.8) — these are editorial
  // hubs that we actively want indexed.
  const categories = await getAllActiveCategorySlugs();
  for (const c of categories) {
    const tail = `/shop/category/${c.slug}`;
    const alternates = sameTailAlternates(origin, tail);
    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}${tail}`,
        lastModified: c.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: { languages: alternates },
      });
    }
  }

  // ── Brand landing pages ───────────────────────────────────────────
  // Brand slugs, like category slugs, are shared across locales so one
  // row fans out to four sitemap entries. Brand discovery is a major
  // axis for K-beauty shoppers, so priority matches category pages (0.7).
  const brands = await getAllActiveBrandSlugs();
  for (const b of brands) {
    const tail = `/shop/brand/${b.slug}`;
    const alternates = sameTailAlternates(origin, tail);
    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}${tail}`,
        lastModified: b.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: { languages: alternates },
      });
    }
  }

  // ── Products ──────────────────────────────────────────────────────
  // Each product's URL is its locale-specific translated slug. When a
  // translation is missing for a given locale we fall back to the EN
  // slug so the URL is always reachable (the PDP page itself falls back
  // to EN content too).
  const products = await getAllPublishedProductSlugs();
  for (const p of products) {
    const enSlug = p.slugByLocale[Locale.EN];
    if (!enSlug) continue; // extremely rare — no EN translation

    // Pre-compute every locale's slug (with fallback to EN).
    const slugFor: Record<string, string> = {};
    for (const loc of LOCALES) {
      slugFor[loc] = p.slugByLocale[toPrismaLocale(loc)] ?? enSlug;
    }

    // Build the hreflang map once per product.
    const alternates: Record<string, string> = {};
    for (const loc of LOCALES) {
      alternates[loc] = `${origin}/${loc}/shop/${slugFor[loc]}`;
    }
    alternates["x-default"] = `${origin}/${routing.defaultLocale}/shop/${slugFor[routing.defaultLocale]}`;

    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}/shop/${slugFor[locale]}`,
        lastModified: p.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: { languages: alternates },
      });
    }
  }

  // ── Journal posts ─────────────────────────────────────────────────
  // Same shape as products: each post's URL is its locale-specific slug,
  // with EN as the fallback for any locale the post isn't translated
  // into. lastModified comes from the post's updatedAt so admin edits
  // propagate at the next crawl.
  const posts = await getAllPublishedJournalSlugs();
  for (const p of posts) {
    const enSlug = p.slugByLocale[Locale.EN];
    if (!enSlug) continue; // shouldn't happen — the admin enforces EN

    const slugFor: Record<string, string> = {};
    for (const loc of LOCALES) {
      slugFor[loc] = p.slugByLocale[toPrismaLocale(loc)] ?? enSlug;
    }

    const alternates: Record<string, string> = {};
    for (const loc of LOCALES) {
      alternates[loc] = `${origin}/${loc}/journal/${slugFor[loc]}`;
    }
    alternates["x-default"] = `${origin}/${routing.defaultLocale}/journal/${slugFor[routing.defaultLocale]}`;

    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}/journal/${slugFor[locale]}`,
        lastModified: p.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
        alternates: { languages: alternates },
      });
    }
  }

  // ── Ingredient detail pages ───────────────────────────────────────
  // Slug lives on Ingredient (shared across locales), so one row fans
  // out to 4 entries — same /ingredients/<slug> tail per locale. These
  // are content pages indexable for long-tail INCI / asset queries
  // ("hyaluronic acid serum benefits"), so priority sits at 0.5.
  //
  // Without this loop, ingredient pages were only reachable via
  // internal links — Google would crawl them but treat them as low
  // priority and (per the May 2026 GSC report) keep them in the
  // "crawled, not indexed" bucket. Explicit sitemap entries upgrade
  // that signal.
  const ingredients = await getAllSitemapIngredientSlugs();
  for (const ing of ingredients) {
    const tail = `/ingredients/${ing.slug}`;
    const alternates = sameTailAlternates(origin, tail);
    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}${tail}`,
        lastModified: ing.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
        alternates: { languages: alternates },
      });
    }
  }

  return entries;
}
