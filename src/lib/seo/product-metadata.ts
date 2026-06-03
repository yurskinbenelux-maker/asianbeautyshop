// Locale-specific PDP meta fallbacks when admin SEO fields are empty.

type UrlLocale = "en" | "nl" | "fr" | "ru";

function asUrlLocale(locale: string): UrlLocale {
  if (locale === "nl" || locale === "fr" || locale === "ru") return locale;
  return "en";
}

const FALLBACK_TITLE: Record<UrlLocale, (name: string) => string> = {
  en: (name) =>
    `${name} — Korean Skincare Belgium | Asian Beauty Shop`,
  nl: (name) =>
    `${name} — Koreaanse huidverzorging kopen | Asian Beauty Shop België`,
  fr: (name) =>
    `${name} — Soins coréens en Belgique | Asian Beauty Shop`,
  ru: (name) =>
    `${name} — корейская косметика в Бельгии | Asian Beauty Shop`,
};

const FALLBACK_DESCRIPTION: Record<UrlLocale, (name: string) => string> = {
  en: (name) =>
    `Buy ${name} at Asian Beauty Shop Belgium. Korean skincare with delivery in Belgium, Netherlands and the EU.`,
  nl: (name) =>
    `Koop ${name} bij Asian Beauty Shop België. Koreaanse huidverzorging met levering in België en Nederland.`,
  fr: (name) =>
    `Achetez ${name} chez Asian Beauty Shop Belgique. Soins coréens avec livraison en Belgique, aux Pays-Bas et dans l’Union européenne.`,
  ru: (name) =>
    `Купить ${name} в Asian Beauty Shop Belgium. Корейская косметика с доставкой по Бельгии, Нидерландам и ЕС.`,
};

/** Strip HTML for plain-text meta / JSON-LD descriptions. */
export function stripProductHtml(html: string | null): string | undefined {
  if (!html) return undefined;
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return undefined;
  return plain.length > 320 ? `${plain.slice(0, 317).trimEnd()}…` : plain;
}

export function productSeoTitle(
  locale: string,
  name: string,
  seoTitle: string | null,
): string {
  if (seoTitle?.trim()) return seoTitle.trim();
  return FALLBACK_TITLE[asUrlLocale(locale)](name);
}

export function productSeoDescription(
  locale: string,
  name: string,
  seoDescription: string | null,
): string {
  if (seoDescription?.trim()) return seoDescription.trim();
  return FALLBACK_DESCRIPTION[asUrlLocale(locale)](name);
}

/** JSON-LD description: admin SEO → tagline → stripped body copy. */
export function productStructuredDescription(
  seoDescription: string | null,
  tagline: string | null,
  descriptionHtml: string,
): string | null {
  if (seoDescription?.trim()) return seoDescription.trim();
  if (tagline?.trim()) return tagline.trim();
  return stripProductHtml(descriptionHtml) ?? null;
}
