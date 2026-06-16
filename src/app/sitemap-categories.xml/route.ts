import { buildCategorySitemapEntries } from "@/lib/sitemap/entries";
import { SITEMAP_REVALIDATE_SECONDS } from "@/lib/sitemap/response";
import { serveUrlsetSitemap } from "@/lib/sitemap/serve";
import { isCleanCategorySitemapUrl } from "@/lib/sitemap/xml";

export const revalidate = SITEMAP_REVALIDATE_SECONDS;

export async function GET() {
  return serveUrlsetSitemap(
    buildCategorySitemapEntries,
    isCleanCategorySitemapUrl,
  );
}
