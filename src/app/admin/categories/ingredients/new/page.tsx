import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { IngredientForm } from "@/components/admin/taxonomies/ingredient-form";

export default function NewIngredientPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12">
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
          New ingredient
        </h1>
      </header>

      <div className="mt-10">
        <IngredientForm
          mode="create"
          initial={{ isKeyAsset: false, isAllergen: false, translations: {} }}
        />
      </div>
    </div>
  );
}
