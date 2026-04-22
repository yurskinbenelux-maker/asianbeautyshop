// ─────────────────────────────────────────────────────────────────────────
// /admin/categories/brands/[id] — edit brand + logo + danger zone.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CheckCircle2, Trash2 } from "lucide-react";
import { getAdminBrand } from "@/lib/queries/admin-taxonomies";
import {
  BrandForm,
  type BrandFormInitial,
} from "@/components/admin/taxonomies/brand-form";
import { BrandLogoForm } from "@/components/admin/taxonomies/brand-logo-form";
import { BrandDangerZone } from "@/components/admin/taxonomies/brand-danger-zone";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ saved?: string }>;

export default async function EditBrandPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const brand = await getAdminBrand(id);
  if (!brand) notFound();

  const initial: BrandFormInitial = {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    isActive: brand.isActive,
    translations: Object.fromEntries(
      brand.translations.map((t) => [t.locale, { tagline: t.tagline, story: t.story }]),
    ),
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <Link
        href="/admin/categories/brands"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to brands
      </Link>

      <header className="mt-4">
        <div className="eyebrow">Organise · Brand</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          {brand.name}
        </h1>
        <p className="mt-2 text-[13px] text-ink-mid">/{brand.slug}</p>
      </header>

      {sp.saved && (
        <p
          className="mt-6 inline-flex items-center gap-2 border border-sage/30 bg-sage/5 px-3 py-2 text-[12px] text-sage"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4" />
          Saved.
        </p>
      )}

      <div className="mt-10">
        <BrandForm mode="edit" initial={initial} />
      </div>

      <section className="mt-14 border-t border-ink/10 pt-10">
        <div className="eyebrow">Logo</div>
        <h2 className="mt-2 font-display text-[20px] text-ink">Brand logo</h2>
        <p className="mt-1 text-[12px] text-ink-mid">
          Shown next to the brand name on the shop and on /brands/[slug]. PNG,
          WEBP, or SVG with a transparent background works best.
        </p>
        <div className="mt-5">
          <BrandLogoForm brandId={brand.id} logoUrl={brand.logoUrl} />
        </div>
      </section>

      <section className="mt-14 border-t border-vermilion/20 pt-10">
        <div className="flex items-center gap-2 text-vermilion">
          <Trash2 className="h-4 w-4" />
          <h2 className="eyebrow text-vermilion">Danger zone</h2>
        </div>
        <p className="mt-2 text-[13px] text-ink-mid">
          Deleting this brand doesn't delete its products — they're just
          unlinked, so you can reassign them later.
        </p>
        <div className="mt-5">
          <BrandDangerZone brandId={brand.id} />
        </div>
      </section>
    </div>
  );
}
