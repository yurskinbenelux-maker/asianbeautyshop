import type { SitemapEntry } from "./entries";
import { sitemapXmlResponse } from "./response";
import {
  buildUrlsetXml,
  type UrlValidator,
} from "./xml";

export async function serveUrlsetSitemap(
  buildEntries: () => Promise<SitemapEntry[]>,
  isValidUrl: UrlValidator,
): Promise<Response> {
  const entries = await buildEntries();
  const xml = buildUrlsetXml(entries, isValidUrl);
  return sitemapXmlResponse(xml);
}
