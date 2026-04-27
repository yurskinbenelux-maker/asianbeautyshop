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

// Three line options surfaced as a single-select picker on the Organise
// tab. We deliberately hard-code the labels here rather than importing
// PRODUCT_LINES from @/lib/queries/products — that module imports
// `prisma` at the top, which would drag the Prisma client into the
// client bundle if a "use client" file pulled from it. The slug values
// must match the canonical PRODUCT_LINES list on the server side.
const LINE_OPTIONS = [
  { slug: "yur" as const, label: "Yu•R" },
  { slug: "yur-pro" as const, label: "Yu•R Pro" },
  { slug: "yur-me" as const, label: "Yu•R Me" },
];
type ProductLineSlug = (typeof LINE_OPTIONS)[number]["slug"];

// ──────── types ──────────────────────────────────────────────────────────

export type TaxonomyOption = {
  id: string;
  slug: string;
  label: string;
};

type Props = {
  productId: string;
  initial: {
    /**
     * Currently-selected line slug. Falls back to "yur" (the default
     * line — null/empty productLine in DB) for legacy products that
     * predate the picker.
     */
    productLineSlug: ProductLineSlug;
    categoryIds: string[];
    skinTypeIds: string[];
    concernIds: string[];
    benefitIds: string[];
    ingredientIds: string[];
  };
  options: {
    categories: TaxonomyOption[];
    skinTypes: TaxonomyOption[];
    concerns: TaxonomyOption[];
    benefits: TaxonomyOption[];
    ingredients: TaxonomyOption[];
  };
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

  // Single-select line picker. Backed by a hidden input named
  // "productLineSlug" so the existing FormData-only server action
  // contract holds — no JSON round-trips, no separate save.
  const [lineSlug, setLineSlug] = useState<ProductLineSlug>(
    initial.productLineSlug,
  );

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

  return (
    <form action={formAction} className="space-y-12">
      {/* ── Line ───────────────────────────────────────────────────── */}
      {/* Single-select. Hidden input feeds productLineSlug into the
          updateOrganise server action; the UI is a row of pill buttons
          mirroring the front-end LineTabs visual language. */}
      <section>
        <header className="flex items-baseline justify-between gap-4">
          <div>
            <h3 className="font-display text-[18px] text-ink">Line</h3>
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-mid">
              Which YU.R line this product belongs to. Drives the line
              tabs on /shop and the line landing pages.
            </p>
          </div>
          <div className="text-[11px] uppercase tracking-label text-ink-mid">
            {LINE_OPTIONS.find((o) => o.slug === lineSlug)?.label ?? "—"}
          </div>
        </header>
        <input type="hidden" name="productLineSlug" value={lineSlug} />
        <div className="mt-5 flex flex-wrap gap-2">
          {LINE_OPTIONS.map((opt) => {
            const isOn = lineSlug === opt.slug;
            return (
              <button
                type="button"
                key={opt.slug}
                onClick={() => setLineSlug(opt.slug)}
                aria-pressed={isOn}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[12px] transition-colors",
                  isOn
                    ? "border-ink bg-ink text-rice"
                    : "border-ink/15 bg-white/60 text-ink-mid hover:border-ink/40 hover:text-ink",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Categories ─────────────────────────────────────────────── */}
      <Section
        title="Categories"
        helper="Shelves on the shop. A product can live on multiple shelves."
        kind="category"
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

