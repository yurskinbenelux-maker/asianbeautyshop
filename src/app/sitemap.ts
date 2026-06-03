import type { MetadataRoute } from "next";
import { Locale } from "@prisma/client";

import { routing } from "@/i18n/routing";
import {
  getAllActiveBrandSlugs,
  getAllActiveCategorySlugs,
  getAllPublishedProductSlugs,
} from "@/lib/queries/products";
import { getAllPublishedJournalSlugs } from "@/lib/queries/journal";
import { getAllSitemapIngredientSlugs } from "@/lib/queries/ingredients";
import { LEGAL_PAGE_KEYS } from "@/lib/queries/pages";

export const revalidate = 3600;

const LOCALES = routing.locales;

function getOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_ORIGIN ??
    "https://asianbeautyshop.eu";

  return raw.replace(/\/+$/, "");
}

function sameTailAlternates(
  origin: string,
  tail: string,
): Record<string, string> {
  const alternates: Record<string, string> = {};

  for (const locale of LOCALES) {
    alternates[locale] = `${origin}/${locale}${tail}`;
  }

  alternates["x-default"] = `${origin}/${routing.defaultLocale}${tail}`;

  return alternates;
}

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
  ];

  for (const route of staticRoutes) {
    const alternates = sameTailAlternates(origin, route.tail);

    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}${route.tail}`,
        lastModified: now,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  for (const key of LEGAL_PAGE_KEYS) {
    const tail = `/legal/${key}`;
    const alternates = sameTailAlternates(origin, tail);

    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}${tail}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.3,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  const categories = await getAllActiveCategorySlugs();

  for (const category of categories) {
    const tail = `/shop/category/${category.slug}`;
    const alternates = sameTailAlternates(origin, tail);

    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}${tail}`,
        lastModified: category.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  const brands = await getAllActiveBrandSlugs();

  for (const brand of brands) {
    const tail = `/shop/brand/${brand.slug}`;
    const alternates = sameTailAlternates(origin, tail);

    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}${tail}`,
        lastModified: brand.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  const products = await getAllPublishedProductSlugs();

  for (const product of products) {
    const enSlug = product.slugByLocale[Locale.EN];

    if (!enSlug) continue;

    const slugFor: Record<string, string> = {};

    for (const locale of LOCALES) {
      slugFor[locale] =
        product.slugByLocale[toPrismaLocale(locale)] ?? enSlug;
    }

    const alternates: Record<string, string> = {};

    for (const locale of LOCALES) {
      alternates[locale] = `${origin}/${locale}/shop/${slugFor[locale]}`;
    }

    alternates["x-default"] =
      `${origin}/${routing.defaultLocale}/shop/${slugFor[routing.defaultLocale]}`;

    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}/shop/${slugFor[locale]}`,
        lastModified: product.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  const posts = await getAllPublishedJournalSlugs();

  for (const post of posts) {
    const enSlug = post.slugByLocale[Locale.EN];

    if (!enSlug) continue;

    const slugFor: Record<string, string> = {};

    for (const locale of LOCALES) {
      slugFor[locale] = post.slugByLocale[toPrismaLocale(locale)] ?? enSlug;
    }

    const alternates: Record<string, string> = {};

    for (const locale of LOCALES) {
      alternates[locale] = `${origin}/${locale}/journal/${slugFor[locale]}`;
    }

    alternates["x-default"] =
      `${origin}/${routing.defaultLocale}/journal/${slugFor[routing.defaultLocale]}`;

    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}/journal/${slugFor[locale]}`,
        lastModified: post.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  const ingredients = await getAllSitemapIngredientSlugs();

  for (const ingredient of ingredients) {
    const tail = `/ingredients/${ingredient.slug}`;
    const alternates = sameTailAlternates(origin, tail);

    for (const locale of LOCALES) {
      entries.push({
        url: `${origin}/${locale}${tail}`,
        lastModified: ingredient.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
        alternates: {
          languages: alternates,
        },
      });
    }
  }

  return entries;
}
