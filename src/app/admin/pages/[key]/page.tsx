import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAdminPageByKey } from "@/lib/queries/admin-pages";
import { PageForm } from "@/components/admin/pages/page-form";
import { PageDangerZone } from "@/components/admin/pages/page-danger-zone";

export const dynamic = "force-dynamic";

export default async function EditPagePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const decoded = decodeURIComponent(key);
  const page = await getAdminPageByKey(decoded);
  if (!page) notFound();

  const title = page.translations.EN.title || "(untitled page)";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/admin/pages"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Pages
      </Link>
      <header className="mt-6 mb-10">
        <div className="eyebrow">Edit page</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          {title}
        </h1>
        <p className="mt-2 font-mono text-[12px] tracking-label text-ink-mid">
          /{page.key}
        </p>
      </header>

      <PageForm
        mode="edit"
        initial={{
          key: page.key,
          isActive: page.isActive,
          translations: page.translations,
        }}
      />

      <div className="mt-12">
        <PageDangerZone pageKey={page.key} />
      </div>
    </div>
  );
}
