// ─────────────────────────────────────────────────────────────────────────
// Metadata helpers — consistent canonical + hreflang + OG across every
// page. The goal is that callers only have to pass the "tail" of a
// route (e.g. "/shop", "/shop/<slug>", "/legal/privacy") and the locale,
// and we compute a full Metadata.alternates block plus OG/Twitter URLs.
//
// For localised alternates we support two shapes:
//
//   buildLocaleAlternates(tail)
//     When the path is the same under every locale prefix — i.e.
//     /<locale><tail>. This is the common case: /shop, /sign-in,
//     /legal/privacy.
//
//   buildPerLocaleAlternates(perLocaleTail)
//     When each locale has its own tail (PDP slugs are translated).
//     Pass { en: "/shop/rice-water-cleanser", nl: "/shop/...", … }.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { siteOrigin } from "@/lib/seo/json-ld";

type Locale = (typeof routing.locales)[number];

/** Canonical absolute URL for a given locale + tail. */
export function canonicalFor(locale: string, tail: string): string {
  const origin = siteOrigin();
  const cleanTail = tail.startsWith("/") || tail === "" ? tail : `/${tail}`;
  return `${origin}/${locale}${cleanTail}`;
}

/** Build alternates.languages for a route whose tail is the same in every
 *  locale. Also sets x-default → defaultLocale. */
export function buildLocaleAlternates(tail: string) {
  const alts: Record<string, string> = {};
  for (const l of routing.locales) alts[l] = canonicalFor(l, tail);
  alts["x-default"] = canonicalFor(routing.defaultLocale, tail);
  return alts;
}

/** Build alternates.languages from a per-locale tail map. Missing locales
 *  fall back to the defaultLocale's tail so the hreflang set is always
 *  complete. */
export function buildPerLocaleAlternates(
  perLocaleTail: Partial<Record<Locale, string>>,
): Record<string, string> {
  const fallback =
    perLocaleTail[routing.defaultLocale] ??
    Object.values(perLocaleTail).find(Boolean) ??
    "/";
  const alts: Record<string, string> = {};
  for (const l of routing.locales) {
    alts[l] = canonicalFor(l, perLocaleTail[l] ?? fallback);
  }
  alts["x-default"] = canonicalFor(routing.defaultLocale, fallback);
  return alts;
}

/** OG locale code the way Facebook/LinkedIn expect it. */
function ogLocale(locale: string): string {
  switch (locale) {
    case "nl":
      return "nl_BE";
    case "fr":
      return "fr_BE";
    case "ru":
      return "ru_RU";
    default:
      return "en_IE";
  }
}

/** Convenience builder: produces a full Metadata block for a page that
 *  lives under the same tail in every locale. The caller still sets
 *  title + description; this just fills in canonical, alternates, and
 *  the OG url/locale bits. */
export function buildPageMetadata({
  locale,
  tail,
  title,
  description,
  ogImage,
  ogType = "website",
}: {
  locale: string;
  tail: string;
  title?: string;
  description?: string;
  ogImage?: string | null;
  ogType?: "website" | "article" | "product";
}): Metadata {
  const url = canonicalFor(locale, tail);
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: buildLocaleAlternates(tail),
    },
    openGraph: {
      title,
      description,
      url,
      locale: ogLocale(locale),
      type: ogType === "product" ? "website" : ogType, // OG has no "product" in its core vocab
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

/** Same idea, but for routes where each locale has its own tail (PDP). */
export function buildPageMetadataPerLocale({
  locale,
  perLocaleTail,
  title,
  description,
  ogImage,
  ogType = "website",
}: {
  locale: string;
  perLocaleTail: Partial<Record<Locale, string>>;
  title?: string;
  description?: string;
  ogImage?: string | null;
  ogType?: "website" | "article" | "product";
}): Metadata {
  const thisTail =
    perLocaleTail[locale as Locale] ??
    perLocaleTail[routing.defaultLocale] ??
    "/";
  const url = canonicalFor(locale, thisTail);
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: buildPerLocaleAlternates(perLocaleTail),
    },
    openGraph: {
      title,
      description,
      url,
      locale: ogLocale(locale),
      type: ogType === "product" ? "website" : ogType,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}
