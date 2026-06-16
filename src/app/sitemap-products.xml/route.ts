import { buildProductSitemapEntries } from "@/lib/sitemap/entries";
import { serveUrlsetSitemap } from "@/lib/sitemap/serve";
import { isCleanProductSitemapUrl } from "@/lib/sitemap/xml";

export const revalidate = 3600;

export async function GET() {
  return serveUrlsetSitemap(
    buildProductSitemapEntries,
    isCleanProductSitemapUrl,
  );
}
