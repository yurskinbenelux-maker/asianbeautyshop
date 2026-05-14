// ─────────────────────────────────────────────────────────────────────────
// /admin/categories/[id] — edit a single category.
//
// Three panels:
//   1. main form (translations + meta)       → CategoryForm
//   2. icon upload / replace                 → inline
//   3. danger zone (delete, requires DELETE) → inline
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CheckCircle2, Trash2 } from "lucide-react";
import { Locale } from "@prisma/client";
import { getAdminCategory } from "@/lib/queries/admin-taxonomies";
import {
  CategoryForm,
  type CategoryFormInitial,
  type ParentOption,
} from "@/components/admin/taxonomies/category-form";
import { CategoryIconForm } from "@/components/admin/taxonomies/category-icon-form";
import { CategoryDangerZone } from "@/components/admin/taxonomies/category-danger-zone";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ saved?: string }>;

export default async function EditCategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const data = await getAdminCategory(id);
  if (!data) notFound();

  const { category, parentOptions } = data;

  const initial: CategoryFormInitial = {
    id: category.id,
    slug: category.slug,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    translations: Object.fromEntries(
      category.translations.map((t) => [
        t.locale,
        {
          name: t.name,
          description: t.description,
          seoTitle: t.seoTitle,
          seoDescription: t.seoDescription,
        },
      ]),
    ),
  };

  const options: ParentOption[] = parentOptions.map((p) => ({
    id: p.id,
    slug: p.slug,
    label: p.translations[0]?.name ?? p.slug,
  }));

  const enName =
    category.translations.find((t) => t.locale === Locale.EN)?.name ||
    "(untitled)";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12">
      <Link
        href="/admin/categories"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to categories
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Organise · Category</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            {enName}
          </h1>
          <p className="mt-2 text-[13px] text-ink-mid">
            /{category.slug} · {category.children.length} sub-categor
            {category.children.length === 1 ? "y" : "ies"}
          </p>
        </div>
      </header>

      {sp.saved && (
        <p
          className={cn(
            "mt-6 inline-flex items-center gap-2 border border-sage/30 bg-sage/5 px-3 py-2 text-[12px] text-sage",
          )}
          role="status"
        >
          <CheckCircle2 className="h-4 w-4" />
          Saved.
        </p>
      )}

      <div className="mt-10">
        <CategoryForm mode="edit" initial={initial} parentOptions={options} />
      </div>

      <section className="mt-14 border-t border-ink/10 pt-10">
        <div className="eyebrow">Icon</div>
        <h2 className="mt-2 font-display text-[20px] text-ink">Category icon</h2>
        <p className="mt-1 text-[12px] text-ink-mid">
          Shown in the menu and on the shop landing. PNG, WEBP, or SVG work
          best on the rice background. 2 MB max.
        </p>
        <div className="mt-5">
          <CategoryIconForm categoryId={category.id} iconUrl={category.iconUrl} />
        </div>
      </section>

      <section className="mt-14 border-t border-vermilion/20 pt-10">
        <div className="flex items-center gap-2 text-vermilion">
          <Trash2 className="h-4 w-4" />
          <h2 className="eyebrow text-vermilion">Danger zone</h2>
        </div>
        <p className="mt-2 text-[13px] text-ink-mid">
          Deleting this category removes it from all products. Any sub-categories
          are promoted to the root.
        </p>
        <div className="mt-5">
          <CategoryDangerZone categoryId={category.id} />
        </div>
      </section>
    </div>
  );
}
