// ─────────────────────────────────────────────────────────────────────────
// /admin/categories/ingredients/[id] — edit ingredient + danger zone.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, CheckCircle2, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getAdminIngredient } from "@/lib/queries/admin-taxonomies";
import {
  IngredientForm,
  type IngredientFormInitial,
} from "@/components/admin/taxonomies/ingredient-form";
import { IngredientDangerZone } from "@/components/admin/taxonomies/ingredient-danger-zone";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ saved?: string }>;

export default async function EditIngredientPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ingredient = await getAdminIngredient(id);
  if (!ingredient) notFound();

  const productCount = await prisma.productIngredient.count({
    where: { ingredientId: id },
  });

  const initial: IngredientFormInitial = {
    id: ingredient.id,
    slug: ingredient.slug,
    inciName: ingredient.inciName,
    isKeyAsset: ingredient.isKeyAsset,
    isAllergen: ingredient.isAllergen,
    translations: Object.fromEntries(
      ingredient.translations.map((t) => [
        t.locale,
        { displayName: t.displayName, description: t.description },
      ]),
    ),
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <Link
        href="/admin/categories/ingredients"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to ingredients
      </Link>

      <header className="mt-4">
        <div className="eyebrow">Organise · Ingredient</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          {ingredient.inciName}
        </h1>
        <p className="mt-2 text-[13px] text-ink-mid">/{ingredient.slug}</p>
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
        <IngredientForm mode="edit" initial={initial} />
      </div>

      <section className="mt-14 border-t border-vermilion/20 pt-10">
        <div className="flex items-center gap-2 text-vermilion">
          <Trash2 className="h-4 w-4" />
          <h2 className="eyebrow text-vermilion">Danger zone</h2>
        </div>
        <p className="mt-2 text-[13px] text-ink-mid">
          Deleting removes the ingredient from every product it appears on.
        </p>
        <div className="mt-5">
          <IngredientDangerZone
            ingredientId={ingredient.id}
            productCount={productCount}
          />
        </div>
      </section>
    </div>
  );
}
