import { buildSitemapIndexEntries } from "@/lib/sitemap/entries";
import { sitemapXmlResponse } from "@/lib/sitemap/response";
import { buildSitemapIndexXml } from "@/lib/sitemap/xml";

// Always render at request time — never ship a stale prerendered urlset from an
// older build. Child sitemaps keep ISR (revalidate = 3600); the index is tiny.
export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await buildSitemapIndexEntries();
  const xml = buildSitemapIndexXml(entries);

  if (xml.includes("<urlset") || xml.includes("<url>")) {
    throw new Error("/sitemap.xml must be a sitemap index only");
  }

  return sitemapXmlResponse(xml);
}
