import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BrandForm } from "@/components/admin/taxonomies/brand-form";

export default function NewBrandPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12">
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
          New brand
        </h1>
      </header>

      <div className="mt-10">
        <BrandForm mode="create" initial={{ isActive: true, translations: {} }} />
      </div>
    </div>
  );
}
