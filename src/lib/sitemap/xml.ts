// ─────────────────────────────────────────────────────────────────────────
// Sitemap XML builders — simple urlsets (loc + lastmod) and sitemap index.
// No hreflang in XML; Google accepted the product-only format in GSC.
// ─────────────────────────────────────────────────────────────────────────

import type { SitemapEntry, SitemapIndexEntry } from "./entries";

const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";

export type UrlValidator = (url: string, origin: string) => boolean;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatSitemapLastmod(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Sitemap entry has invalid lastmod date");
  }
  return date.toISOString();
}

function parseCanonicalUrl(url: string, expectedOrigin: string) {
  if (!url?.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const origin = expectedOrigin.replace(/\/+$/, "");
  if (parsed.origin !== origin) return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.hash) return null;
  if (parsed.search) return null;

  return { parsed, path: decodeURIComponent(parsed.pathname) };
}

const PAGES_PATH =
  /^\/(en|nl|fr|ru)(?:\/(?:shop|sale|new|brands|ingredients|journal|quiz|rituals|faq|shipping|contact|legal\/[^/]+))?$/;

const PRODUCT_PATH =
  /^\/(en|nl|fr|ru)\/shop\/(?!category\/|brand\/)[^/]+$/;

const CATEGORY_PATH = /^\/(en|nl|fr|ru)\/shop\/category\/[^/]+$/;

const BRAND_PATH = /^\/(en|nl|fr|ru)\/shop\/brand\/[^/]+$/;

const INGREDIENT_PATH = /^\/(en|nl|fr|ru)\/ingredients\/[^/]+$/;

function matchesPath(
  url: string,
  origin: string,
  pattern: RegExp,
): boolean {
  const parsed = parseCanonicalUrl(url, origin);
  if (!parsed) return false;
  return pattern.test(parsed.path);
}

export const isCleanPagesSitemapUrl: UrlValidator = (url, origin) =>
  matchesPath(url, origin, PAGES_PATH);

export const isCleanProductSitemapUrl: UrlValidator = (url, origin) =>
  matchesPath(url, origin, PRODUCT_PATH);

export const isCleanCategorySitemapUrl: UrlValidator = (url, origin) =>
  matchesPath(url, origin, CATEGORY_PATH);

export const isCleanBrandSitemapUrl: UrlValidator = (url, origin) =>
  matchesPath(url, origin, BRAND_PATH);

export const isCleanIngredientSitemapUrl: UrlValidator = (url, origin) =>
  matchesPath(url, origin, INGREDIENT_PATH);

export function buildUrlsetXml(
  entries: SitemapEntry[],
  isValidUrl: UrlValidator,
): string {
  const origin = entries[0]?.loc
    ? new URL(entries[0].loc).origin
    : "https://asianbeautyshop.eu";

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${SITEMAP_NS}">`,
  ];

  const seenLocs = new Set<string>();

  for (const entry of entries) {
    if (!entry.loc?.trim()) continue;
    if (!isValidUrl(entry.loc, origin)) continue;
    if (seenLocs.has(entry.loc)) continue;
    seenLocs.add(entry.loc);

    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
    lines.push(
      `    <lastmod>${escapeXml(formatSitemapLastmod(entry.lastModified))}</lastmod>`,
    );
    lines.push("  </url>");
  }

  lines.push("</urlset>");
  const xml = `${lines.join("\n")}\n`;

  assertValidUrlsetXml(xml);
  return xml;
}

export function buildSitemapIndexXml(entries: SitemapIndexEntry[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<sitemapindex xmlns="${SITEMAP_NS}">`,
  ];

  for (const entry of entries) {
    if (!entry.loc?.trim()) continue;
    lines.push("  <sitemap>");
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
    lines.push(
      `    <lastmod>${escapeXml(formatSitemapLastmod(entry.lastModified))}</lastmod>`,
    );
    lines.push("  </sitemap>");
  }

  lines.push("</sitemapindex>");
  const xml = `${lines.join("\n")}\n`;

  assertValidSitemapIndexXml(xml);
  return xml;
}

export function assertValidUrlsetXml(xml: string): void {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    throw new Error("Sitemap XML: missing UTF-8 declaration");
  }

  if (!xml.includes(`<urlset xmlns="${SITEMAP_NS}">`)) {
    throw new Error("Sitemap XML: missing urlset namespace");
  }

  if (xml.includes("xmlns:xhtml") || xml.includes("xhtml:link")) {
    throw new Error("Sitemap XML: urlset must not include hreflang");
  }

  assertNoInvalidXmlCharacters(xml);

  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  if (urlBlocks.length === 0) {
    throw new Error("Sitemap XML: no url entries");
  }

  for (const block of urlBlocks) {
    if (!/<loc>[^<]+<\/loc>/.test(block)) {
      throw new Error("Sitemap XML: url entry missing loc");
    }
    if (!/<lastmod>[^<]+<\/lastmod>/.test(block)) {
      throw new Error("Sitemap XML: url entry missing lastmod");
    }
    if (block.includes("?")) {
      throw new Error("Sitemap XML: query string in url entry");
    }
  }
}

export function assertValidSitemapIndexXml(xml: string): void {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    throw new Error("Sitemap index: missing UTF-8 declaration");
  }

  if (!xml.includes(`<sitemapindex xmlns="${SITEMAP_NS}">`)) {
    throw new Error("Sitemap index: missing sitemapindex namespace");
  }

  if (xml.includes("<urlset") || xml.includes("<url>")) {
    throw new Error("Sitemap index: must not contain urlset or url entries");
  }

  if (xml.includes("xmlns:xhtml") || xml.includes("xhtml:link")) {
    throw new Error("Sitemap index: must not include hreflang");
  }

  assertNoInvalidXmlCharacters(xml);

  const blocks = xml.match(/<sitemap>[\s\S]*?<\/sitemap>/g) ?? [];
  if (blocks.length === 0) {
    throw new Error("Sitemap index: no sitemap entries");
  }

  for (const block of blocks) {
    if (!/<loc>[^<]+<\/loc>/.test(block)) {
      throw new Error("Sitemap index: entry missing loc");
    }
    if (!/<lastmod>[^<]+<\/lastmod>/.test(block)) {
      throw new Error("Sitemap index: entry missing lastmod");
    }
  }
}

function assertNoInvalidXmlCharacters(xml: string): void {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/.test(xml)) {
    throw new Error("Sitemap XML: unescaped ampersand");
  }
}
