// ─────────────────────────────────────────────────────────────────────────
// /admin/ingredients — list page for the Ingredient library.
//
// Unlike the public /ingredients page, this view shows every row
// regardless of whether a product currently links to it. Sofia can:
//   · toggle the key-asset / allergen flags in-line
//   · click the slug / display name to open the full editor
//   · create a new ingredient via the masthead button
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Plus, Sparkles, AlertTriangle, Beaker } from "lucide-react";
import { listAdminIngredients } from "@/lib/queries/admin-ingredients";
import { requireCapability } from "@/lib/auth-roles";
import { toggleIngredientFlagAction } from "./actions";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function AdminIngredientsPage() {
  // Ingredients are content — editors can manage; owners always can.
  await requireCapability("ingredients.edit");

  const rows = await listAdminIngredients();

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Ingredients</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            Ingredient library
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            Every active we formulate with. Mark hero ingredients as
            {" "}
            <em>key actives</em> to feature them on /ingredients and on
            product detail pages.
          </p>
        </div>
        <Link
          href="/admin/ingredients/new"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New ingredient
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="border border-ink/10 bg-white/60">
          <table className="w-full text-[13px]">
            <thead className="border-b border-ink/10 text-[10px] uppercase tracking-label text-ink-mid">
              <tr>
                <th className="px-4 py-3 text-left font-normal">
                  Display name (EN)
                </th>
                <th className="px-4 py-3 text-left font-normal">INCI</th>
                <th className="px-4 py-3 text-left font-normal">Slug</th>
                <th className="px-4 py-3 text-left font-normal">Languages</th>
                <th className="px-4 py-3 text-left font-normal">Products</th>
                <th className="px-4 py-3 text-left font-normal">Flags</th>
                <th className="px-4 py-3 text-left font-normal">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-ink/5 last:border-0 hover:bg-rice/40"
                >
                  <td className="max-w-xs px-4 py-3">
                    <Link
                      href={`/admin/ingredients/${r.id}`}
                      className="block truncate text-ink hover:underline"
                      title={r.displayPreview}
                    >
                      {r.displayPreview}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-mid">{r.inciName}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-ink-mid">
                    {r.slug}
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {r.translationCount} / 4
                  </td>
                  <td className="px-4 py-3 text-ink-mid">{r.productCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FlagToggle
                        id={r.id}
                        flag="isKeyAsset"
                        on={r.isKeyAsset}
                        onLabel="Key"
                        onIcon={<Sparkles className="h-3 w-3" />}
                        onClassOn="border-vermilion/40 text-vermilion"
                      />
                      <FlagToggle
                        id={r.id}
                        flag="isAllergen"
                        on={r.isAllergen}
                        onLabel="Allergen"
                        onIcon={<AlertTriangle className="h-3 w-3" />}
                        onClassOn="border-ink/30 text-ink"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {DATE.format(r.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function FlagToggle({
  id,
  flag,
  on,
  onLabel,
  onIcon,
  onClassOn,
}: {
  id: string;
  flag: "isKeyAsset" | "isAllergen";
  on: boolean;
  onLabel: string;
  onIcon: React.ReactNode;
  onClassOn: string;
}) {
  return (
    <form action={toggleIngredientFlagAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="flag" value={flag} />
      <button
        type="submit"
        className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] uppercase tracking-label transition-colors ${
          on
            ? onClassOn
            : "border-ink/10 text-ink-mid/50 hover:border-ink/30 hover:text-ink-mid"
        }`}
        title={on ? `Remove ${onLabel.toLowerCase()} flag` : `Mark as ${onLabel.toLowerCase()}`}
        aria-pressed={on}
      >
        {on && onIcon}
        {onLabel}
      </button>
    </form>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
      <Beaker className="mx-auto h-6 w-6 text-ink-mid" />
      <h2 className="mt-4 font-display text-[22px] text-ink">
        No ingredients yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
        Add actives here as you learn the ingredient stories behind
        each product. Mark the standouts as <em>key actives</em> and
        they&apos;ll feature on the public /ingredients page.
      </p>
      <Link
        href="/admin/ingredients/new"
        className="mt-6 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
      >
        <Plus className="h-3.5 w-3.5" />
        Add the first ingredient
      </Link>
    </div>
  );
}
