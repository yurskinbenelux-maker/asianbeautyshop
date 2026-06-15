// ─────────────────────────────────────────────────────────────────────────
// Strict sitemap.xml builder — explicit escaping + validation for Google.
// Next.js MetadataRoute.Sitemap serialisation is bypassed so every URL and
// hreflang alternate is XML-safe and query-param URLs never slip through.
// ─────────────────────────────────────────────────────────────────────────

import type { SitemapEntry } from "./entries";

const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

/** Disallow search/filter pagination URLs and any non-canonical query strings. */
const BLOCKED_QUERY_KEYS = new Set([
  "category",
  "concern",
  "brand",
  "skinType",
  "sort",
  "page",
  "q",
  "search",
]);

/**
 * Public indexable paths only — no /account, /search, /checkout, /api, etc.
 * Query strings are rejected separately in isCleanCanonicalSitemapUrl().
 */
const ALLOWED_PATH =
  /^\/(en|nl|fr|ru)(?:\/(?:shop(?:\/(?:category|brand)\/[^/]+|\/[^/]+)?|sale|new|brands|ingredients(?:\/[^/]+)?|journal(?:\/[^/]+)?|quiz|rituals|faq|shipping|contact|legal\/[^/]+))?$/;

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

export function isCleanCanonicalSitemapUrl(
  url: string,
  expectedOrigin: string,
): boolean {
  if (!url || typeof url !== "string") return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const origin = expectedOrigin.replace(/\/+$/, "");
  if (parsed.origin !== origin) return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.hash) return false;

  for (const key of parsed.searchParams.keys()) {
    if (BLOCKED_QUERY_KEYS.has(key)) return false;
    // Reject any query string — sitemap URLs must be canonical paths only.
    return false;
  }

  const path = decodeURIComponent(parsed.pathname);
  if (!ALLOWED_PATH.test(path)) return false;

  return true;
}

function formatPriority(priority: number | undefined): string | null {
  if (priority === undefined) return null;
  const clamped = Math.min(1, Math.max(0, priority));
  return clamped.toFixed(1);
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const origin = entries[0]?.loc
    ? new URL(entries[0].loc).origin
    : "https://asianbeautyshop.eu";

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${SITEMAP_NS}" xmlns:xhtml="${XHTML_NS}">`,
  ];

  const seenLocs = new Set<string>();

  for (const entry of entries) {
    if (!entry.loc?.trim()) continue;
    if (!isCleanCanonicalSitemapUrl(entry.loc, origin)) continue;
    if (seenLocs.has(entry.loc)) continue;
    seenLocs.add(entry.loc);

    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);

    if (entry.alternates) {
      for (const [hreflang, href] of Object.entries(entry.alternates)) {
        if (!href?.trim()) continue;
        if (!isCleanCanonicalSitemapUrl(href, origin)) continue;
        lines.push(
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(href)}" />`,
        );
      }
    }

    lines.push(
      `    <lastmod>${escapeXml(formatSitemapLastmod(entry.lastModified))}</lastmod>`,
    );

    if (entry.changeFrequency) {
      lines.push(
        `    <changefreq>${escapeXml(entry.changeFrequency)}</changefreq>`,
      );
    }

    const priority = formatPriority(entry.priority);
    if (priority !== null) {
      lines.push(`    <priority>${priority}</priority>`);
    }

    lines.push("  </url>");
  }

  lines.push("</urlset>");
  const xml = `${lines.join("\n")}\n`;

  assertValidSitemapXml(xml);
  return xml;
}

/** Runtime guard — mirrors what xmllint checks before we ship the response. */
export function assertValidSitemapXml(xml: string): void {
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    throw new Error("Sitemap XML: missing UTF-8 declaration");
  }

  if (!xml.includes(`xmlns="${SITEMAP_NS}"`)) {
    throw new Error("Sitemap XML: wrong urlset namespace (must be http://)");
  }

  if (!xml.includes(`xmlns:xhtml="${XHTML_NS}"`)) {
    throw new Error("Sitemap XML: missing xhtml namespace");
  }

  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/.test(xml)) {
    throw new Error("Sitemap XML: unescaped ampersand");
  }

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
