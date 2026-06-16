import { buildSitemapIndexEntries } from "./entries";
import { sitemapXmlResponse } from "./response";
import { buildSitemapIndexXml } from "./xml";

/** Sitemap index XML — shared by /sitemap.xml and /sitemap-index.xml. */
export async function serveSitemapIndex(): Promise<Response> {
  const entries = await buildSitemapIndexEntries();
  const xml = buildSitemapIndexXml(entries);

  if (xml.includes("<urlset") || xml.includes("<url>")) {
    throw new Error("Sitemap index must not contain urlset or url entries");
  }

  return sitemapXmlResponse(xml);
}
