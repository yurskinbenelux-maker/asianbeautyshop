import { buildSitemapIndexEntries } from "@/lib/sitemap/entries";
import { SITEMAP_REVALIDATE_SECONDS, sitemapXmlResponse } from "@/lib/sitemap/response";
import { buildSitemapIndexXml } from "@/lib/sitemap/xml";

export const revalidate = SITEMAP_REVALIDATE_SECONDS;

export async function GET() {
  const entries = await buildSitemapIndexEntries();
  const xml = buildSitemapIndexXml(entries);
  return sitemapXmlResponse(xml);
}
