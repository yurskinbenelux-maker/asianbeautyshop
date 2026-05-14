// ─────────────────────────────────────────────────────────────────────────
// /admin/ingredients/new — blank IngredientForm in create mode.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Locale } from "@prisma/client";
import {
  IngredientForm,
  type IngredientFormValues,
} from "@/components/admin/ingredients/ingredient-form";
import { requireCapability } from "@/lib/auth-roles";

export default async function NewIngredientPage() {
  await requireCapability("ingredients.edit");

  const values: IngredientFormValues = {
    slug: "",
    inciName: "",
    isKeyAsset: false,
    isAllergen: false,
    translations: {
      [Locale.EN]: null,
      [Locale.NL]: null,
      [Locale.FR]: null,
      [Locale.RU]: null,
    },
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/admin/ingredients"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Ingredients
      </Link>

      <header className="mb-10 mt-6">
        <div className="eyebrow">New ingredient</div>
        <h1 className="mt-2 font-display text-[26px] leading-tight text-ink">
          Add an active
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-mid">
          Give it an INCI name (exactly as registered) and an English
          display name. Translations and descriptions can land later — the
          ingredient is usable from products the moment you save.
        </p>
      </header>

      <IngredientForm mode="create" values={values} />
    </div>
  );
}
