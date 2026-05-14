// ─────────────────────────────────────────────────────────────────────────
// /admin/categories/tags — inline CRUD for the three "simple" taxonomies:
// Concerns, Skin types, Benefits.
//
// Simple = slug + per-locale label (Benefit adds one lucide icon name).
// No routing per-item: every row is inline-editable and the "add new"
// form sits at the top. Much faster for an admin than a full page per tag.
// ─────────────────────────────────────────────────────────────────────────

import { listSimpleTaxonomy, type SimpleTaxonomyKind } from "@/lib/queries/admin-taxonomies";
import { TagsKindTabs } from "@/components/admin/taxonomies/tags-kind-tabs";
import { TagRow } from "@/components/admin/taxonomies/tag-row";
import { TagNewForm } from "@/components/admin/taxonomies/tag-new-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ kind?: string }>;

function parseKind(v: string | undefined): SimpleTaxonomyKind {
  if (v === "skin-type" || v === "benefit") return v;
  return "concern";
}

const PLACEHOLDERS: Record<SimpleTaxonomyKind, string> = {
  concern: "e.g. Dullness",
  "skin-type": "e.g. Combination",
  benefit: "e.g. Hydrating",
};

const EMPTY_COPY: Record<SimpleTaxonomyKind, string> = {
  concern: "No concerns yet. Add one with the form above.",
  "skin-type": "No skin types yet. Add one with the form above.",
  benefit: "No benefits yet. Add one with the form above.",
};

export default async function TagsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const kind = parseKind(sp.kind);
  const rows = await listSimpleTaxonomy(kind);
  const hasIcon = kind === "benefit";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <header>
        <div className="eyebrow">Organise</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Tags
        </h1>
        <p className="mt-2 text-[13px] text-ink-mid">
          The finer filters customers use to browse the shop. Each tag has a
          slug (for the URL) and a label per language.
        </p>
      </header>

      <div className="mt-8">
        <TagsKindTabs current={kind} />
      </div>

      <div className="mt-6">
        <TagNewForm
          kind={kind}
          hasIcon={hasIcon}
          placeholder={PLACEHOLDERS[kind]}
        />
      </div>

      <section className="mt-8 border border-ink/10 bg-white/60">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-[13px] text-ink-mid">
            {EMPTY_COPY[kind]}
          </div>
        ) : (
          <ul role="list" className="divide-y divide-ink/5">
            {rows.map((row) => (
              <TagRow key={row.id} kind={kind} row={row} hasIcon={hasIcon} />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-[11px] text-ink-mid">
        Deletion is blocked while products reference a tag — remove the tag
        from those products first, or change their tag in the product editor.
      </p>
    </div>
  );
}
