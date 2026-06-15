import { buildSitemapEntries } from "@/lib/sitemap/entries";
import { buildSitemapXml } from "@/lib/sitemap/xml";

export const revalidate = 3600;

export async function GET() {
  const entries = await buildSitemapEntries();
  const xml = buildSitemapXml(entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
