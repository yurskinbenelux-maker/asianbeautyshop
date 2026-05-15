// ─────────────────────────────────────────────────────────────────────────
// GET /api/feeds/google-merchant.xml
//
// Public RSS 2.0 product feed for Google Merchant Center.
//
// How this connects to Merchant Center:
//   1. Merchant Center → Products → Data sources → Add data source
//   2. Pick "Add products from a file" → "Schedule a fetch"
//   3. File name: google-merchant.xml
//   4. URL:       https://asianbeautyshop.eu/api/feeds/google-merchant.xml
//   5. Frequency: daily (Google's default; paid tiers allow hourly)
//
// Google then pulls this URL on the schedule, validates every <item>, and
// makes the products eligible for Google Shopping + Performance Max +
// Shopping Ads. Adding/editing/archiving a product in admin will reflect
// in Shopping within ~24h (or whatever the Merchant Center fetch cadence
// is set to).
//
// Why RSS 2.0 with the `g` namespace (not Atom or the newer JSON API):
//   · RSS 2.0 + g: is Google's most mature, best-documented format
//   · No auth/tokens to manage — public URL, Google polls it
//   · No state — every fetch is a full re-sync
//
// Why this route is intentionally public (no auth):
//   Google's bots can't authenticate, and product data here is exactly
//   what's on the public PDPs already. There is NOTHING in this feed
//   that a visitor couldn't crawl from /shop directly.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import {
  getProductsForGoogleFeed,
  type GoogleFeedProduct,
} from "@/lib/queries/google-feed";

// Force dynamic rendering so the feed always reflects the live DB.
// We achieve "fresh enough" via short CDN cache headers rather than
// Next's static cache (which would otherwise serve a stale snapshot
// for the full revalidate window).
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://asianbeautyshop.eu";

  const products = await getProductsForGoogleFeed(origin);
  const xml = renderFeedXml(products, origin);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      // Google's crawler honours Content-Type — XML must be declared,
      // otherwise the fetch flips to "Could not download" in Merchant
      // Center.
      "Content-Type": "application/xml; charset=utf-8",
      // Cache for 15 minutes at the edge. Google's default crawl is
      // every ~24h so the cache shaves DB load during the busy window
      // after an admin batch-edits products and Merchant Center happens
      // to re-poll. Public so Cloudflare can serve it.
      "Cache-Control": "public, max-age=900, s-maxage=900",
    },
  });
}

// ────────── XML rendering ───────────────────────────────────────────────

/**
 * Render the full RSS 2.0 feed string. We do this with template
 * literals rather than an XML library because:
 *   · ~150 lines for the whole feed — not worth a dependency
 *   · The structure is trivial (flat channel + repeated items)
 *   · Easy to read and debug — what you see in source = what Google sees
 *
 * The `escapeXml()` helper protects against the only sharp edges:
 *   ·  &  <  >  "  '  in product titles/descriptions
 */
function renderFeedXml(items: GoogleFeedProduct[], origin: string): string {
  const channelTitle = "Asian Beauty Shop";
  const channelLink = origin;
  const channelDescription =
    "Premium K-beauty skincare — sunscreens, serums, masks, toners, and rituals.";

  const itemsXml = items.map(renderItem).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${escapeXml(channelLink)}</link>
    <description>${escapeXml(channelDescription)}</description>
${itemsXml}
  </channel>
</rss>
`;
}

/**
 * Render one <item> in the Google Shopping flavour of RSS 2.0.
 *
 * Field reference: https://support.google.com/merchants/answer/7052112
 * Validators: https://merchants.google.com (Diagnostics tab after first fetch)
 *
 * Required fields we always emit:
 *   id, title, description, link, image_link, availability, price,
 *   brand, condition, google_product_category
 *
 * Optional fields we emit when present:
 *   sale_price, gtin, mpn, additional_image_link (multiple)
 */
function renderItem(p: GoogleFeedProduct): string {
  if (!p.imageUrl) return ""; // Defensive — already filtered upstream.

  const additionalImages = p.additionalImageUrls
    .map(
      (url) =>
        `      <g:additional_image_link>${escapeXml(url)}</g:additional_image_link>`,
    )
    .join("\n");

  const saleTag = p.salePrice
    ? `      <g:sale_price>${escapeXml(p.salePrice)}</g:sale_price>\n`
    : "";

  const gtinTag = p.gtin
    ? `      <g:gtin>${escapeXml(p.gtin)}</g:gtin>\n`
    : "";

  return `    <item>
      <g:id>${escapeXml(p.id)}</g:id>
      <g:title>${escapeXml(p.title)}</g:title>
      <g:description>${escapeXml(p.description)}</g:description>
      <g:link>${escapeXml(p.link)}</g:link>
      <g:image_link>${escapeXml(p.imageUrl)}</g:image_link>
${additionalImages ? additionalImages + "\n" : ""}      <g:availability>${escapeXml(p.availability)}</g:availability>
      <g:price>${escapeXml(p.price)}</g:price>
${saleTag}      <g:brand>${escapeXml(p.brand)}</g:brand>
      <g:condition>${escapeXml(p.condition)}</g:condition>
${gtinTag}      <g:mpn>${escapeXml(p.mpn)}</g:mpn>
      <g:google_product_category>${escapeXml(p.googleProductCategory)}</g:google_product_category>
      <g:identifier_exists>${p.gtin ? "yes" : "no"}</g:identifier_exists>
    </item>`;
}

/**
 * XML entity escape. Order matters — `&` must run first so subsequent
 * substitutions don't double-encode their own ampersands.
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
