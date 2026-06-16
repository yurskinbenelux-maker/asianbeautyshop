import { buildIngredientSitemapEntries } from "@/lib/sitemap/entries";
import { serveUrlsetSitemap } from "@/lib/sitemap/serve";
import { isCleanIngredientSitemapUrl } from "@/lib/sitemap/xml";

export const revalidate = 3600;

export async function GET() {
  return serveUrlsetSitemap(
    buildIngredientSitemapEntries,
    isCleanIngredientSitemapUrl,
  );
}
