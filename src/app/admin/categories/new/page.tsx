// ─────────────────────────────────────────────────────────────────────────
// /admin/categories/new — create form, seeded with sensible defaults.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CategoryForm, type ParentOption } from "@/components/admin/taxonomies/category-form";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
  const parents = await prisma.category.findMany({
    select: {
      id: true,
      slug: true,
      translations: { where: { locale: Locale.EN }, select: { name: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const parentOptions: ParentOption[] = parents.map((p) => ({
    id: p.id,
    slug: p.slug,
    label: p.translations[0]?.name ?? p.slug,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12">
      <Link
        href="/admin/categories"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to categories
      </Link>
      <header className="mt-4">
        <div className="eyebrow">Organise</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          New category
        </h1>
        <p className="mt-2 text-[13px] text-ink-mid">
          Fill in the English name. The other languages can come later.
        </p>
      </header>

      <div className="mt-10">
        <CategoryForm
          mode="create"
          initial={{
            sortOrder: parents.length,
            isActive: true,
            translations: {},
          }}
          parentOptions={parentOptions}
        />
      </div>
    </div>
  );
}
