import { buildBrandSitemapEntries } from "@/lib/sitemap/entries";
import { serveUrlsetSitemap } from "@/lib/sitemap/serve";
import { isCleanBrandSitemapUrl } from "@/lib/sitemap/xml";

export const revalidate = 3600;

export async function GET() {
  return serveUrlsetSitemap(buildBrandSitemapEntries, isCleanBrandSitemapUrl);
}
