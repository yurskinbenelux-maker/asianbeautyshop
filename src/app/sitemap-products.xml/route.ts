import { buildProductSitemapEntries } from "@/lib/sitemap/entries";
import { buildSimpleSitemapXml } from "@/lib/sitemap/xml";

export const revalidate = 3600;

export async function GET() {
  const entries = await buildProductSitemapEntries();
  const xml = buildSimpleSitemapXml(entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
