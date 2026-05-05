// ─────────────────────────────────────────────────────────────────────────
// OrganiseForm — the Organise tab on /admin/products/[id].
//
// Shape: five sections (Categories · Skin types · Concerns · Benefits ·
// Ingredients). Each section is a wrapped row of toggle pills — clicking
// a pill flips it between selected / unselected. Below each section is a
// tiny "+ Add new" inline form so Sofia can seed a missing taxonomy
// without leaving the product editor.
//
// State model:
//   · One useState<Set<string>> per relation, seeded from server data.
//   · One useState<Option[]> per relation for the visible option list
//     (grows when the admin creates a new item inline).
//   · A single hidden-input-per-selected-id approach feeds the server
//     action on Save, so the action can read formData.getAll("categoryIds")
//     etc. No JSON, no stringify/parse.
//
// Save is gated behind useActionState so the status message behaves the
// same as the Basics / Translations tabs (success pill + error pill).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import {
  useActionState,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { Plus, Search, X } from "lucide-react";
import {
  updateOrganise,
  createTaxonomyItem,
  type ActionState,
  type TaxonomyKind,
} from "@/app/admin/products/actions";
import { cn } from "@/lib/utils";
import { AiSuggestTagsButton } from "@/components/admin/products/ai-suggest-tags";

// The dedicated Lines picker (Yu•R / Yu•R Pro / Yu•R Me) was retired
// in favour of the Brand picker — they were two controls expressing the
// same thing. Product.productLine is now derived server-side from the
// chosen brand's slug, so the homepage / shop line-tab queries continue
// to work unchanged. See updateOrganise in actions.ts for the mapping.

// ──────── types ──────────────────────────────────────────────────────────

export type TaxonomyOption = {
  id: string;
  slug: string;
  label: string;
  // Category-only metadata. The other taxonomies (skinType, concern,
  // benefit, ingredient) are flat — these fields stay undefined for them.
  // Tracked here rather than on a separate type so the existing
  // Section/InlineCreate plumbing keeps working unchanged for everything
  // except the dedicated CategoriesSection below.
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
};

type Props = {
  productId: string;
  initial: {
    /**
     * Currently-selected brand ID (single-select, optional). null when
     * the product has no brand attached — typical for legacy rows
     * before the YU.R seed ran. Drives the Brand picker at the top of
     * the form, which writes back to Product.brandId. Server derives
     * Product.productLine from the chosen brand's slug on save.
     */
    brandId: string | null;
    categoryIds: string[];
    skinTypeIds: string[];
    concernIds: string[];
    benefitIds: string[];
    ingredientIds: string[];
  };
  options: {
    /**
     * Brands available in the picker. Server filters to active brands
     * plus the currently-attached brand (even if archived) so Sofia
     * can untag.
     */
    brands: BrandOption[];
    categories: TaxonomyOption[];
    skinTypes: TaxonomyOption[];
    concerns: TaxonomyOption[];
    benefits: TaxonomyOption[];
    ingredients: TaxonomyOption[];
  };
};

export type BrandOption = {
  id: string;
  slug: string;
  label: string;
  isActive: boolean;
};

// ──────── form ───────────────────────────────────────────────────────────

const INITIAL_STATE: ActionState = { ok: true };

export function OrganiseForm({ productId, initial, options }: Props) {
  const [state, formAction] = useActionState(
    updateOrganise.bind(null, productId),
    INITIAL_STATE,
  );

  // One selection Set per relation. Sets make toggling O(1) and survive
  // reorders / re-renders without tripping over array identity.
  const [categoryIds, setCategoryIds] = useState<Set<string>>(
    () => new Set(initial.categoryIds),
  );
  const [skinTypeIds, setSkinTypeIds] = useState<Set<string>>(
    () => new Set(initial.skinTypeIds),
  );
  const [concernIds, setConcernIds] = useState<Set<string>>(
    () => new Set(initial.concernIds),
  );
  const [benefitIds, setBenefitIds] = useState<Set<string>>(
    () => new Set(initial.benefitIds),
  );
  const [ingredientIds, setIngredientIds] = useState<Set<string>>(
    () => new Set(initial.ingredientIds),
  );

  // Single-select brand picker. "" means "no brand attached". The
  // server action validates the id against the Brand table on save and
  // derives Product.productLine from the brand's slug.
  const [brandId, setBrandId] = useState<string>(initial.brandId ?? "");

  // Options mirror the server-provided lists but allow local growth when
  // the admin creates a new taxonomy item inline. We keep them sorted by
  // label so the UI stays stable.
  const [categories, setCategories] = useState(options.categories);
  const [skinTypes, setSkinTypes] = useState(options.skinTypes);
  const [concerns, setConcerns] = useState(options.concerns);
  const [benefits, setBenefits] = useState(options.benefits);
  const [ingredients, setIngredients] = useState(options.ingredients);

  function onTaxonomyCreated(kind: TaxonomyKind, created: TaxonomyOption) {
    const sortFn = (a: TaxonomyOption, b: TaxonomyOption) =>
      a.label.localeCompare(b.label);
    switch (kind) {
      case "category":
        setCategories((cur) => [...cur, created].sort(sortFn));
        setCategoryIds((s) => new Set(s).add(created.id));
        break;
      case "skinType":
        setSkinTypes((cur) => [...cur, created].sort(sortFn));
        setSkinTypeIds((s) => new Set(s).add(created.id));
        break;
      case "concern":
        setConcerns((cur) => [...cur, created].sort(sortFn));
        setConcernIds((s) => new Set(s).add(created.id));
        break;
      case "benefit":
        setBenefits((cur) => [...cur, created].sort(sortFn));
        setBenefitIds((s) => new Set(s).add(created.id));
        break;
      case "ingredient":
        setIngredients((cur) => [...cur, created].sort(sortFn));
        setIngredientIds((s) => new Set(s).add(created.id));
        break;
    }
  }

  // Lookup tables — slug → label — for the AI diff modal. Built once
  // at render time from the taxonomy options the form already has, so
  // the diff renders human-readable chip text instead of slugs. Brand
  // is excluded — the AI doesn't pick brand, Sofia does.
  const aiLabels = useMemo(
    () => ({
      categories: Object.fromEntries(
        options.categories.map((c) => [c.slug, c.label]),
      ),
      skinTypes: Object.fromEntries(
        options.skinTypes.map((s) => [s.slug, s.label]),
      ),
      concerns: Object.fromEntries(
        options.concerns.map((c) => [c.slug, c.label]),
      ),
      benefits: Object.fromEntries(
        options.benefits.map((b) => [b.slug, b.label]),
      ),
    }),
    [
      options.categories,
      options.skinTypes,
      options.concerns,
      options.benefits,
    ],
  );

  return (
    <form action={formAction} className="space-y-12">
      {/* ── AI helper banner ───────────────────────────────────────────
          One-click categorisation — fills Brand + Category + Subcategory
          + Skin Types + Concerns + Benefits in one Groq call. Renders a
          diff modal so Sofia approves before anything is written. */}
      <section className="border border-vermilion/20 bg-vermilion/5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-[16px] text-ink">
              AI quick-tag
            </h3>
            <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-ink-mid">
              Click to have the AI suggest brand + category + skin types +
              concerns + benefits based on the product&apos;s name and INCI.
              You&apos;ll see a diff before anything is saved.
            </p>
          </div>
          <AiSuggestTagsButton productId={productId} labels={aiLabels} />
        </div>
      </section>

      {/* ── Brand ──────────────────────────────────────────────────────
          Single-select. Drives the right column of the customer-facing
          mega-menu. Initially we seed YU.R / YU.R Pro / YU.R Me here so
          Sofia just picks one; when K-beauty brands arrive she'll add
          AHC / iUNIK / etc. via /admin/brands and they'll appear in
          this dropdown automatically. Hidden input "brandId" feeds the
          server action — empty string means "no brand", which writes
          NULL to Product.brandId. */}
      <BrandSection
        options={options.brands}
        value={brandId}
        onChange={setBrandId}
      />

      {/* ── Categories ─────────────────────────────────────────────── */}
      {/* Two visually-distinct rows: top-level categories (the parent
          "shelves" — Cleansers, Toners, …) and subcategories (specific
          shelves under each parent — Hydrating Toners, Calming Toners,
          …). Sofia picks the most specific shelf the product belongs to;
          a product can sit on the parent OR on one or more subs, or both. */}
      <CategoriesSection
        fieldName="categoryIds"
        options={categories}
        selected={categoryIds}
        onToggle={(id) => setCategoryIds(toggle(categoryIds, id))}
        onCreated={(opt) => onTaxonomyCreated("category", opt)}
      />

      {/* ── Skin types ────────────────────────────────────────────── */}
      <Section
        title="Skin types"
        helper="Who is this product for? Typical values: dry, oily, combination, sensitive, mature."
        kind="skinType"
        fieldName="skinTypeIds"
        options={skinTypes}
        selected={skinTypeIds}
        onToggle={(id) => setSkinTypeIds(toggle(skinTypeIds, id))}
        onCreated={(opt) => onTaxonomyCreated("skinType", opt)}
      />

      {/* ── Concerns ──────────────────────────────────────────────── */}
      <Section
        title="Concerns"
        helper="What does it treat? Dark spots, fine lines, redness, congestion…"
        kind="concern"
        fieldName="concernIds"
        options={concerns}
        selected={concernIds}
        onToggle={(id) => setConcernIds(toggle(concernIds, id))}
        onCreated={(opt) => onTaxonomyCreated("concern", opt)}
      />

      {/* ── Benefits ──────────────────────────────────────────────── */}
      <Section
        title="Benefits"
        helper="Short promises. Hydrates, brightens, calms, protects."
        kind="benefit"
        fieldName="benefitIds"
        options={benefits}
        selected={benefitIds}
        onToggle={(id) => setBenefitIds(toggle(benefitIds, id))}
        onCreated={(opt) => onTaxonomyCreated("benefit", opt)}
      />

      {/* ── Ingredients (searchable — can get long) ──────────────── */}
      <Section
        title="Ingredients"
        helper="Key assets and hero actives. Full INCI list goes in the product description."
        kind="ingredient"
        fieldName="ingredientIds"
        options={ingredients}
        selected={ingredientIds}
        onToggle={(id) => setIngredientIds(toggle(ingredientIds, id))}
        onCreated={(opt) => onTaxonomyCreated("ingredient", opt)}
        searchable
      />

      {/* ── Quick-add from INCI list ────────────────────────────────
          Companion to the pill picker above. Sofia pastes a comma- or
          semicolon-separated INCI declaration and on Save the server
          action upserts each name into the master Ingredient library
          (creating an English stub translation), then links them to
          this product. Means she never has to pre-seed ingredients
          one-by-one for a new K-beauty supplier sheet — same auto-grow
          behaviour the CSV import gets. */}
      <section className="border border-dashed border-ink/20 p-5">
        <header>
          <h3 className="font-display text-[16px] text-ink">
            Or paste an INCI list
          </h3>
          <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-ink-mid">
            Paste a comma-separated INCI declaration here (e.g.{" "}
            <em>Aqua, Glycerin, Niacinamide, Hyaluronic Acid</em>). On
            Save, any unknown ingredients are added to the master library
            and linked to this product. You can refine names + descriptions
            later in <strong>Ingredients</strong>.
          </p>
        </header>
        <textarea
          name="ingredientFreeText"
          rows={3}
          placeholder="Aqua, Glycerin, Niacinamide, Sodium Hyaluronate, Centella Asiatica Extract…"
          className="mt-4 w-full border border-ink/15 bg-white/80 p-3 font-mono text-[12.5px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        />
      </section>

      {/* ── Save row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-t border-ink/10 pt-6">
        <SaveButton />
        <StatusMessage state={state} />
      </div>
    </form>
  );
}

// ──────── Section ────────────────────────────────────────────────────────

type SectionProps = {
  title: string;
  helper: string;
  kind: TaxonomyKind;
  fieldName: string;
  options: TaxonomyOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onCreated: (opt: TaxonomyOption) => void;
  searchable?: boolean;
};

function Section({
  title,
  helper,
  kind,
  fieldName,
  options,
  selected,
  onToggle,
  onCreated,
  searchable,
}: SectionProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q),
    );
  }, [options, query, searchable]);

  return (
    <section>
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="font-display text-[18px] text-ink">{title}</h3>
          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-mid">
            {helper}
          </p>
        </div>
        <div className="text-[11px] uppercase tracking-label text-ink-mid">
          {selected.size} / {options.length} selected
        </div>
      </header>

      {/* Search (ingredients only for now) */}
      {searchable && (
        <div className="mt-4 flex items-center gap-2 border-b border-ink/10 pb-2">
          <Search className="h-3.5 w-3.5 text-ink-mid" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter ingredients…"
            className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-mid/60 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-ink-mid hover:text-ink"
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Pills */}
      <div className="mt-5 flex flex-wrap gap-2">
        {visible.length === 0 ? (
          <div className="text-[13px] italic text-ink-mid">
            {options.length === 0
              ? "None yet — add your first one below."
              : "No matches."}
          </div>
        ) : (
          visible.map((opt) => {
            const isOn = selected.has(opt.id);
            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => onToggle(opt.id)}
                aria-pressed={isOn}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                  isOn
                    ? "border-ink bg-ink text-rice"
                    : "border-ink/15 bg-white/60 text-ink-mid hover:border-ink/40 hover:text-ink",
                )}
              >
                {opt.label}
              </button>
            );
          })
        )}
      </div>

      {/* Hidden inputs — one per selected id — for the server action */}
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name={fieldName} value={id} />
      ))}

      {/* Inline add-new */}
      <InlineCreate kind={kind} onCreated={onCreated} />
    </section>
  );
}

// ──────── InlineCreate ───────────────────────────────────────────────────
//
// A mini form that posts to the `createTaxonomyItem` server action.
// We don't use useActionState here because we want to (a) capture the
// returned createdId to mark the new pill selected, and (b) reset the
// input after a successful add — both of which are easier with a manual
// useTransition + async call than with the form-bound hook.

type InlineCreateProps = {
  kind: TaxonomyKind;
  onCreated: (opt: TaxonomyOption) => void;
};

function InlineCreate({ kind, onCreated }: InlineCreateProps) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleAdd() {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Enter a name.");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("label", trimmed);
      const result = await createTaxonomyItem({ ok: true }, fd);
      if (result.ok && result.createdId) {
        onCreated({
          id: result.createdId,
          slug: slugifyForDisplay(trimmed),
          label: trimmed,
        });
        setLabel("");
      } else {
        setError(result.message ?? "Couldn't add that item.");
      }
    });
  }

  return (
    <div className="mt-5 flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        value={label}
        onChange={(e) => {
          setLabel(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault(); // don't submit the outer <form>
            handleAdd();
          }
        }}
        placeholder="Add new…"
        disabled={pending}
        className="w-56 border-b border-ink/15 bg-transparent py-1.5 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none disabled:opacity-60"
      />
      <button
        type="button"
        onClick={handleAdd}
        disabled={pending || !label.trim()}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] uppercase tracking-label transition-colors",
          pending || !label.trim()
            ? "text-ink-mid/50"
            : "text-ink-mid hover:text-ink",
        )}
      >
        <Plus className="h-3 w-3" />
        {pending ? "Adding…" : "Add"}
      </button>
      {error && (
        <span className="text-[12px] text-vermilion">{error}</span>
      )}
    </div>
  );
}

// ──────── SaveButton · StatusMessage ─────────────────────────────────────

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-2 bg-ink px-6 py-3 text-[12px] uppercase tracking-label text-rice transition-colors",
        pending ? "opacity-60" : "hover:bg-ink-soft",
      )}
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

function StatusMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <span
      className={cn(
        "text-[12px]",
        state.ok ? "text-gold" : "text-vermilion",
      )}
    >
      {state.message}
    </span>
  );
}

// ──────── helpers ────────────────────────────────────────────────────────

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Best-effort slug for the optimistic UI label. Server still authoritative. */
function slugifyForDisplay(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 BrandSection \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
//
// Single-select Brand picker. Renders as a row of pills (same visual as
// the Lines + Categories sections) so the entire Organise tab reads as
// one consistent control style. Why pills instead of a <select>? With
// 3-10 brands it's easier to scan and one-click tag than a dropdown,
// and it matches Sofia's mental model of "click the brand badge".
//
// "(no brand)" is intentionally NOT a chip \u2014 Sofia clears the brand by
// clicking the currently-active chip a second time (toggle off). This
// avoids accidentally showing "no brand" as a sticky selection on
// fresh products. The picker is optional: products with NULL brandId
// just don't show in any brand column on the mega-menu.
type BrandSectionProps = {
  options: BrandOption[];
  value: string; // brandId or "" for none
  onChange: (next: string) => void;
};

function BrandSection({ options, value, onChange }: BrandSectionProps) {
  const active = options.filter((b) => b.isActive);
  const inactive = options.filter((b) => !b.isActive);
  const selected = options.find((b) => b.id === value);

  return (
    <section>
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="font-display text-[18px] text-ink">Brand</h3>
          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-mid">
            Who makes this product. One brand per product. New brands
            appear here automatically once Sofia adds them in
            /admin/brands.
          </p>
        </div>
        <div className="text-[11px] uppercase tracking-label text-ink-mid">
          {selected ? selected.label : "\u2014"}
        </div>
      </header>

      {/* Hidden input \u2014 server reads formData.get("brandId"). Empty
          string is a deliberate "no brand" signal handled by the
          action. */}
      <input type="hidden" name="brandId" value={value} />

      <div className="mt-5 flex flex-wrap gap-2">
        {active.length === 0 ? (
          <span className="text-[13px] italic text-ink-mid">
            No brands yet \u2014 seed via the YU.R brands script or add via
            /admin/brands.
          </span>
        ) : (
          active.map((b) => {
            const isOn = value === b.id;
            return (
              <button
                type="button"
                key={b.id}
                onClick={() => onChange(isOn ? "" : b.id)}
                aria-pressed={isOn}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[12px] transition-colors",
                  isOn
                    ? "border-ink bg-ink text-rice"
                    : "border-ink/15 bg-white/60 text-ink-mid hover:border-ink/40 hover:text-ink",
                )}
              >
                {b.label}
              </button>
            );
          })
        )}
      </div>

      {/* Archived brands \u2014 only rendered if the current product is
          tagged with one. Lets Sofia see + clear stale assignments
          without polluting the main row. */}
      {inactive.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-dashed border-ink/15 pt-3">
          <span className="text-[11px] uppercase tracking-label text-ink-mid/80">
            Archived:
          </span>
          {inactive.map((b) => {
            const isOn = value === b.id;
            return (
              <button
                type="button"
                key={b.id}
                onClick={() => onChange(isOn ? "" : b.id)}
                aria-pressed={isOn}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] transition-colors",
                  isOn
                    ? "border-vermilion/60 bg-vermilion/10 text-vermilion line-through"
                    : "border-dashed border-ink/25 bg-transparent text-ink-mid/60 line-through hover:text-ink-mid",
                )}
                title={`${b.label} \u2014 archived. Click to untag this product.`}
              >
                {b.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 CategoriesSection \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
//
// Categories are the only taxonomy with a 2-level tree (Categories \u2192
// Subcategories). The flat <Section> renderer dumps everything in one
// alphabetical chip soup, which made it impossible to see which subs
// belonged to which parent. This dedicated component splits the picker
// into:
//
//   1. CATEGORIES   \u2014 top-level "shelf" pills (Cleansers, Toners, \u2026).
//                     Each one acts as a chip just like before.
//
//   2. SUBCATEGORIES \u2014 for each parent that HAS children, a labelled
//                     row showing only that parent's children. Parents
//                     with zero children are skipped here and just live
//                     in the top row.
//
//   3. ARCHIVED      \u2014 only rendered if this product is currently tagged
//                     with a category that has been archived
//                     (isActive=false). Shown muted so Sofia can untag
//                     them without crowding the main picker.
//
// Inline create stays at the bottom: it always adds top-level. For
// nested parent-picking on create, /admin/categories is the better
// surface \u2014 this picker is for tagging, not for restructuring the tree.
type CategoriesSectionProps = {
  fieldName: string;
  options: TaxonomyOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onCreated: (opt: TaxonomyOption) => void;
};

function CategoriesSection({
  fieldName,
  options,
  selected,
  onToggle,
  onCreated,
}: CategoriesSectionProps) {
  // Index for fast parent lookups.
  const byId = useMemo(
    () => new Map(options.map((o) => [o.id, o])),
    [options],
  );

  // Sort helper: respect sortOrder when present, fall back to label.
  const sortFn = (a: TaxonomyOption, b: TaxonomyOption) => {
    const ao = a.sortOrder ?? 9999;
    const bo = b.sortOrder ?? 9999;
    if (ao !== bo) return ao - bo;
    return a.label.localeCompare(b.label);
  };

  // Active = visible in the picker. Inactive = product is currently
  // tagged with this category but it's been archived; render in the
  // muted "Archived" group.
  const active = useMemo(
    () => options.filter((o) => o.isActive !== false),
    [options],
  );
  const archived = useMemo(
    () => options.filter((o) => o.isActive === false),
    [options],
  );

  // Top-level parents (no parentId).
  const topLevel = useMemo(
    () => active.filter((o) => !o.parentId).sort(sortFn),
    [active],
  );

  // Children grouped by parent.
  const childrenByParent = useMemo(() => {
    const map = new Map<string, TaxonomyOption[]>();
    for (const o of active) {
      if (!o.parentId) continue;
      // Skip orphans whose parent isn't in the visible set.
      if (!byId.has(o.parentId)) continue;
      const arr = map.get(o.parentId) ?? [];
      arr.push(o);
      map.set(o.parentId, arr);
    }
    for (const arr of map.values()) arr.sort(sortFn);
    return map;
  }, [active, byId]);

  // Parents that actually have subs render in the SUBCATEGORIES section.
  // Parents with no subs don't get a sub-block (their pill is in the
  // CATEGORIES row above and that's enough).
  const parentsWithChildren = useMemo(
    () => topLevel.filter((p) => (childrenByParent.get(p.id) ?? []).length > 0),
    [topLevel, childrenByParent],
  );

  // Orphan children whose parent was somehow filtered out \u2014 defensive,
  // shouldn't happen in practice but if it does we surface them so they
  // remain editable.
  const orphans = useMemo(
    () => active.filter((o) => o.parentId && !byId.has(o.parentId)),
    [active, byId],
  );

  return (
    <section>
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="font-display text-[18px] text-ink">Categories</h3>
          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-mid">
            Shelves on the shop. Pick a top-level category and any specific
            subcategories the product belongs to \u2014 products can live on
            multiple shelves.
          </p>
        </div>
        <div className="text-[11px] uppercase tracking-label text-ink-mid">
          {selected.size} / {active.length} selected
        </div>
      </header>

      {/* \u2500\u2500 Top-level (parents) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      <div className="mt-6">
        <div className="text-[11px] uppercase tracking-label text-ink-mid/80">
          Category
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {topLevel.length === 0 ? (
            <span className="text-[13px] italic text-ink-mid">
              No categories yet \u2014 add one below.
            </span>
          ) : (
            topLevel.map((opt) => (
              <CategoryPill
                key={opt.id}
                opt={opt}
                isOn={selected.has(opt.id)}
                onToggle={onToggle}
                emphasis="parent"
              />
            ))
          )}
        </div>
      </div>

      {/* \u2500\u2500 Subcategories grouped by parent \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      {parentsWithChildren.length > 0 && (
        <div className="mt-8 space-y-5 border-t border-ink/10 pt-6">
          <div className="text-[11px] uppercase tracking-label text-ink-mid/80">
            Subcategory
          </div>
          {parentsWithChildren.map((parent) => {
            const kids = childrenByParent.get(parent.id) ?? [];
            return (
              <div
                key={parent.id}
                className="grid gap-3 md:grid-cols-[140px_1fr] md:items-baseline md:gap-6"
              >
                <div className="font-display text-[14px] text-ink/80">
                  {parent.label}
                </div>
                <div className="flex flex-wrap gap-2">
                  {kids.map((opt) => (
                    <CategoryPill
                      key={opt.id}
                      opt={opt}
                      isOn={selected.has(opt.id)}
                      onToggle={onToggle}
                      emphasis="child"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* \u2500\u2500 Orphans (defensive, rare) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      {orphans.length > 0 && (
        <div className="mt-6 border-t border-dashed border-ink/15 pt-5">
          <div className="text-[11px] uppercase tracking-label text-ink-mid/80">
            Unattached subcategories
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {orphans.map((opt) => (
              <CategoryPill
                key={opt.id}
                opt={opt}
                isOn={selected.has(opt.id)}
                onToggle={onToggle}
                emphasis="child"
              />
            ))}
          </div>
        </div>
      )}

      {/* \u2500\u2500 Archived (muted, only if currently tagged) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      {archived.length > 0 && (
        <div className="mt-6 border-t border-dashed border-ink/15 pt-5">
          <div className="text-[11px] uppercase tracking-label text-ink-mid/80">
            Archived (hidden from shop) \u2014 untag to clean up
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {archived.map((opt) => (
              <CategoryPill
                key={opt.id}
                opt={opt}
                isOn={selected.has(opt.id)}
                onToggle={onToggle}
                emphasis="archived"
              />
            ))}
          </div>
        </div>
      )}

      {/* Hidden inputs \u2014 one per selected id \u2014 for the server action.
          Kept identical to the flat Section so updateOrganise reads
          formData.getAll("categoryIds") exactly as before. */}
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name={fieldName} value={id} />
      ))}

      {/* Inline add \u2014 top-level by default. /admin/categories is the
          right surface for re-parenting / reordering. */}
      <InlineCreate kind="category" onCreated={onCreated} />
    </section>
  );
}

type CategoryPillProps = {
  opt: TaxonomyOption;
  isOn: boolean;
  onToggle: (id: string) => void;
  emphasis: "parent" | "child" | "archived";
};

function CategoryPill({ opt, isOn, onToggle, emphasis }: CategoryPillProps) {
  // Three subtly different visual treatments:
  //   parent   \u2014 full-weight pill (the primary chip)
  //   child    \u2014 slightly smaller pill, lighter idle border
  //   archived \u2014 muted text, dashed border, strike to signal "leaving"
  const base =
    "inline-flex items-center gap-1.5 rounded-full border transition-colors";
  const sizes =
    emphasis === "child"
      ? "px-3 py-1 text-[11.5px]"
      : "px-3 py-1.5 text-[12px]";
  const variant =
    emphasis === "archived"
      ? isOn
        ? "border-vermilion/60 bg-vermilion/10 text-vermilion line-through"
        : "border-dashed border-ink/25 bg-transparent text-ink-mid/60 line-through hover:text-ink-mid"
      : isOn
        ? "border-ink bg-ink text-rice"
        : emphasis === "parent"
          ? "border-ink/15 bg-white/60 text-ink-mid hover:border-ink/40 hover:text-ink"
          : "border-ink/10 bg-white/40 text-ink-mid hover:border-ink/30 hover:text-ink";

  return (
    <button
      type="button"
      onClick={() => onToggle(opt.id)}
      aria-pressed={isOn}
      className={cn(base, sizes, variant)}
      title={
        emphasis === "archived"
          ? `${opt.label} \u2014 archived. Click to untag this product.`
          : opt.label
      }
    >
      {opt.label}
    </button>
  );
}

