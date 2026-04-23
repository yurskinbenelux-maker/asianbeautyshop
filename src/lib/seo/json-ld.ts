// ─────────────────────────────────────────────────────────────────────────
// schema.org JSON-LD builders.
//
// Everything returns a plain object — we serialise + inline it into the
// page with <script type="application/ld+json">. We never interpolate
// untrusted strings into JSON-LD; the builders escape as part of JSON.
//
// Why these three types:
//   · Organization — identifies K'Elmus Group BV on the site as a whole,
//     so Google can link the YU.R brand to the legal entity.
//   · WebSite      — enables the Sitelinks search box (future: when we
//     ship the global search, the `potentialAction` below points at it).
//   · Product      — makes PDPs eligible for rich results (price, rating,
//     availability cards) in search.
//
// Every helper returns the object. The <JsonLd> React component below
// handles the stringify + script-tag dance. Never hand-write the <script>
// inline at the call site: the helper avoids forgetting `dangerouslySet`
// or the `application/ld+json` type attribute.
// ─────────────────────────────────────────────────────────────────────────

import { routing } from "@/i18n/routing";

/** Site origin — e.g. https://yurskinsolution.eu. Normalised without
 *  trailing slash so callers can safely concatenate "/foo". */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Human site name — override via env for white-label deploys. */
export function siteName(): string {
  return process.env.NEXT_PUBLIC_SITE_NAME ?? "YU.R Skin Solution";
}

// ─── Organization ────────────────────────────────────────────────────
// A single source of truth for the legal entity behind YU.R. If Sofia
// ever moves countries, updates the VAT number, or changes support email,
// this is the one place to edit — and Google's Knowledge Graph will pick
// up the change on the next crawl.
export function organizationJsonLd() {
  const origin = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: siteName(),
    legalName: "K'Elmus Group BV",
    url: origin,
    logo: `${origin}/brand/logo.svg`,
    // schema.org recognises vatID + taxID for business identity. Feeding
    // these in helps Google's Knowledge Graph match the YU.R brand to
    // the actual legal entity — useful for B2B trust + rich results.
    vatID: "BE1031312116",
    taxID: "BE1031312116",
    sameAs: [
      // Populate as Sofia hands us the profile URLs.
      // "https://www.instagram.com/yurskinsolution",
      // "https://www.tiktok.com/@yurskinsolution",
    ],
    address: {
      "@type": "PostalAddress",
      streetAddress: "Boomsesteenweg 41/4b",
      postalCode: "2630",
      addressLocality: "Aartselaar",
      addressCountry: "BE",
    },
    // A contact point is optional but helps Google's Knowledge Panel.
    contactPoint: [
      {
        "@type": "ContactPoint",
        email: "hello@yurskinsolution.eu",
        contactType: "customer support",
        areaServed: ["BE", "NL", "FR", "LU"],
        availableLanguage: ["English", "Dutch", "French", "Russian"],
      },
    ],
  };
}

// ─── WebSite ─────────────────────────────────────────────────────────
// Declares the site + hints at the sitelinks search box. Once the global
// /search endpoint ships (task #61), Google will surface a search input
// directly inside the YU.R result card.
export function websiteJsonLd() {
  const origin = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    url: origin,
    name: siteName(),
    inLanguage: Array.from(routing.locales),
    publisher: { "@id": `${origin}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${origin}/${routing.defaultLocale}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

// ─── Product ─────────────────────────────────────────────────────────
// Used on the PDP. Includes offer + aggregateRating when we have data.
// Rich-result eligibility requires at least name, image, offers — the
// rest is gravy that Google may or may not display.
export type ProductJsonLdInput = {
  name: string;
  description: string | null;
  sku: string;
  brandName: string | null;
  priceEur: number;
  comparePriceEur: number | null;
  images: Array<{ url: string; alt: string | null }>;
  inStock: boolean;
  /** Canonical URL for this PDP (absolute). */
  canonicalUrl: string;
  review?: {
    ratingValue: number | null;
    reviewCount: number;
  };
};

export function productJsonLd(p: ProductJsonLdInput) {
  const origin = siteOrigin();
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    mpn: p.sku,
    url: p.canonicalUrl,
    image: p.images.length > 0 ? p.images.map((i) => i.url) : undefined,
    description: p.description ?? undefined,
    brand: p.brandName
      ? { "@type": "Brand", name: p.brandName }
      : undefined,
    offers: {
      "@type": "Offer",
      url: p.canonicalUrl,
      price: p.priceEur.toFixed(2),
      priceCurrency: "EUR",
      availability: p.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${origin}/#organization` },
    },
  };

  // Only emit aggregateRating when we actually have reviews — Google will
  // reject the structured data block if reviewCount is 0.
  if (
    p.review &&
    p.review.ratingValue !== null &&
    p.review.reviewCount > 0
  ) {
    obj.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: p.review.ratingValue.toFixed(1),
      reviewCount: p.review.reviewCount,
      bestRating: "5",
      worstRating: "1",
    };
  }

  return obj;
}
