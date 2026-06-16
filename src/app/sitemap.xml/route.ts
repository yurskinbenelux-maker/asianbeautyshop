import { buildSitemapIndexEntries } from "@/lib/sitemap/entries";
import { sitemapXmlResponse } from "@/lib/sitemap/response";
import { buildSitemapIndexXml } from "@/lib/sitemap/xml";

export const revalidate = 3600;

export async function GET() {
  const entries = await buildSitemapIndexEntries();
  const xml = buildSitemapIndexXml(entries);
  return sitemapXmlResponse(xml);
}
