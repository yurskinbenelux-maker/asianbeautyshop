// ─────────────────────────────────────────────────────────────────────────
// /admin/ingredients/[id] — edit a single ingredient.
//
// Includes a read-only "Linked products" strip so an admin can see where
// this ingredient is currently surfaced before renaming / deleting it.
// Delete is destructive (cascades product links — products don't lose
// their rows, they lose their link to this ingredient).
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Trash2, Sparkles } from "lucide-react";
import { Locale } from "@prisma/client";
import { getAdminIngredient } from "@/lib/queries/admin-ingredients";
import {
  IngredientForm,
  type IngredientFormValues,
} from "@/components/admin/ingredients/ingredient-form";
import { deleteIngredientAction } from "../actions";
import { requireCapability } from "@/lib/auth-roles";

export const dynamic = "force-dynamic";

export default async function EditIngredientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapability("ingredients.edit");
  const { id } = await params;
  const row = await getAdminIngredient(id);
  if (!row) notFound();

  const values: IngredientFormValues = {
    id: row.id,
    slug: row.slug,
    inciName: row.inciName,
    isKeyAsset: row.isKeyAsset,
    isAllergen: row.isAllergen,
    translations: {
      [Locale.EN]: row.translations.EN,
      [Locale.NL]: row.translations.NL,
      [Locale.FR]: row.translations.FR,
      [Locale.RU]: row.translations.RU,
    },
  };

  const displayName = row.translations.EN?.displayName ?? row.inciName;

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
        <div className="flex items-center gap-3">
          <div className="eyebrow">Edit ingredient</div>
          {row.isKeyAsset && (
            <span className="inline-flex items-center gap-1 border border-vermilion/40 bg-vermilion/5 px-2 py-[2px] text-[10px] uppercase tracking-label text-vermilion">
              <Sparkles className="h-3 w-3" aria-hidden />
              Key active
            </span>
          )}
        </div>
        <h1 className="mt-2 font-display text-[26px] leading-tight text-ink">
          {displayName}
        </h1>
        <p className="mt-2 font-mono text-[11px] tracking-label text-ink-mid">
          {row.slug} · {row.inciName}
        </p>
      </header>

      <IngredientForm mode="edit" values={values} />

      {/* ── linked products ────────────────────────────────────── */}
      <section className="mt-16 border-t border-ink/10 pt-8">
        <h2 className="font-display text-[18px] text-ink">
          Linked products ({row.linkedProducts.length})
        </h2>
        <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-ink-mid">
          Products currently using this ingredient. Click through to edit
          the product's ingredient list from there.
        </p>
        {row.linkedProducts.length === 0 ? (
          <p className="mt-4 text-[13px] text-ink-mid">
            <em>Not yet linked to any product.</em>
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {row.linkedProducts.map((p) => (
              <li key={p.productId}>
                <Link
                  href={`/admin/products/${p.productId}`}
                  className="flex items-center justify-between gap-3 border border-ink/10 bg-white/60 px-3 py-2 text-[13px] transition-colors hover:border-vermilion/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-ink">{p.productNameEn}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-ink-mid">
                      {p.productSku}
                    </div>
                  </div>
                  {p.isKey && (
                    <span className="inline-block border border-vermilion/40 px-2 py-0.5 text-[10px] uppercase tracking-label text-vermilion">
                      Hero
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── danger zone ────────────────────────────────────────── */}
      <div className="mt-16 border-t border-ink/10 pt-8">
        <h2 className="font-display text-[18px] text-ink">Danger zone</h2>
        <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-ink-mid">
          Deleting an ingredient removes every translation and disconnects
          it from every product that currently uses it. The products stay
          intact — only the ingredient link is removed. This action
          cannot be undone.
        </p>
        <form action={deleteIngredientAction} className="mt-4">
          <input type="hidden" name="id" value={row.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-vermilion/40 px-4 py-2 text-[12px] uppercase tracking-label text-vermilion hover:border-vermilion hover:bg-vermilion/5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete ingredient
          </button>
        </form>
      </div>
    </div>
  );
}
