// ─────────────────────────────────────────────────────────────────────────
// /admin/categories/ingredients — INCI list. Ingredients are the finest
// grain of the taxonomy (niacinamide, centella, etc). The list is flat
// and alphabetical by inciName.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Plus, Star, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { listAdminIngredients } from "@/lib/queries/admin-taxonomies";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ deleted?: string }>;

export default async function IngredientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const rows = await listAdminIngredients();

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Organise</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            Ingredients
          </h1>
          <p className="mt-2 text-[13px] text-ink-mid">
            Hero INCIs so customers can filter by what's actually in the
            formula. Mark key assets to feature them on product pages, and
            allergens to warn sensitive users.
          </p>
        </div>
        <Link
          href="/admin/categories/ingredients/new"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New ingredient
        </Link>
      </header>

      {sp.deleted && (
        <p className="mt-6 border border-sage/30 bg-sage/5 px-3 py-2 text-[12px] text-sage">
          Ingredient deleted.
        </p>
      )}

      <section className="mt-10 border border-ink/10 bg-white/60">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-[13px] text-ink-mid">
            No ingredients yet. Add your first one.
          </div>
        ) : (
          <ul role="list" className="divide-y divide-ink/5">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/admin/categories/ingredients/${row.id}`}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-rice/60"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center border text-[10px] uppercase tracking-label",
                      row.isKeyAsset
                        ? "border-gold/40 bg-gold/10 text-gold"
                        : "border-ink/15 bg-white text-ink-mid",
                    )}
                  >
                    {row.inciName.charAt(0)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] text-ink">
                        {row.inciName}
                      </span>
                      {row.isKeyAsset && (
                        <span className="inline-flex items-center gap-1 border border-gold/40 bg-gold/5 px-1.5 py-0.5 text-[9px] uppercase tracking-label text-gold">
                          <Star className="h-2.5 w-2.5" />
                          Key
                        </span>
                      )}
                      {row.isAllergen && (
                        <span className="inline-flex items-center gap-1 border border-vermilion/30 bg-vermilion/5 px-1.5 py-0.5 text-[9px] uppercase tracking-label text-vermilion">
                          <ShieldAlert className="h-2.5 w-2.5" />
                          Allergen
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-ink-mid">
                      /{row.slug}
                    </div>
                  </div>

                  <span className="text-[11px] uppercase tracking-label text-ink-mid">
                    {row.productCount} product{row.productCount === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
