import { serveSitemapIndex } from "@/lib/sitemap/serve-index";

export const dynamic = "force-dynamic";

export async function GET() {
  return serveSitemapIndex();
}
