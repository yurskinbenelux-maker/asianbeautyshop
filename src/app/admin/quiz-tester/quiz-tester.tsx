// ─────────────────────────────────────────────────────────────────────────
// QuizTester — admin client component that drives the public /api/ai/quiz
// endpoint with a controllable form, then renders the same ritual picks
// the customer would see, plus admin-only diagnostics (score per pick,
// matched ingredients, direct edit link to /admin/products/[id]).
//
// Three blocks:
//   1. Input form (7 quiz questions)
//   2. "Simulate" button → POST /api/ai/quiz → display below
//   3. Result grid: one card per ritual step (cleanse / toner / treat /
//      cream / mask / spf), each showing product + match score + INCI
//      hits + "Edit product tags" CTA back to the product detail page.
//
// We rely on the existing /api/ai/quiz endpoint so the engine is exactly
// the same as customers hit. If you change the scoring, this page
// changes too — no parallel implementation to keep in sync.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Loader2,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Quiz option lists — kept in sync with src/lib/ai/quiz.ts ───────────
//
// These are the literal IDs the server accepts. Labels are admin-only
// English copy (no i18n needed — Sofia + Max read the admin in English).

const SKIN_TYPES = [
  { id: "dry", label: "Dry" },
  { id: "combo", label: "Combination" },
  { id: "oily", label: "Oily" },
  { id: "sensitive", label: "Sensitive" },
  { id: "normal", label: "Normal" },
] as const;

const PRIMARY_CONCERNS = [
  { id: "hydration", label: "Hydration" },
  { id: "dullness", label: "Dullness / radiance" },
  { id: "acne", label: "Acne / breakouts" },
  { id: "fine-lines", label: "Fine lines" },
  { id: "dark-spots", label: "Dark spots" },
  { id: "pores", label: "Pores" },
  { id: "redness", label: "Redness" },
] as const;

const SECONDARY_CONCERNS = [
  { id: "tightness", label: "Tightness" },
  { id: "texture", label: "Texture" },
  { id: "dark-circles", label: "Dark circles" },
  { id: "sun-damage", label: "Sun damage" },
  { id: "firmness", label: "Firmness" },
  { id: "sensitive-eyes", label: "Sensitive eyes" },
] as const;

const REACTIVITY = [
  { id: "never", label: "Never" },
  { id: "sometimes", label: "Sometimes" },
  { id: "often", label: "Often" },
] as const;

const SUN_EXPOSURE = [
  { id: "indoors", label: "Indoors mostly" },
  { id: "commute", label: "Commute / errands" },
  { id: "outdoor", label: "Outdoor regularly" },
  { id: "strong", label: "Strong / sport / beach" },
] as const;

const AGE_BANDS = [
  { id: "u25", label: "Under 25" },
  { id: "25-34", label: "25–34" },
  { id: "35-44", label: "35–44" },
  { id: "45+", label: "45+" },
] as const;

const RITUAL_DEPTHS = [
  { id: "minimal", label: "Minimal (3 steps)" },
  { id: "balanced", label: "Balanced (4–5 steps)" },
  { id: "full", label: "Full (5–6 steps)" },
] as const;

const STEP_LABEL: Record<string, string> = {
  cleanse: "Cleanse",
  toner: "Toner",
  treat: "Treat (essence / serum / peeling)",
  cream: "Cream",
  mask: "Mask",
  spf: "SPF",
};

// ─── Response shape from /api/ai/quiz ────────────────────────────────────
//
// Mirrors the QuizResult type in src/lib/ai/quiz.ts. Kept duplicated here
// so this component doesn't reach into server-only types from a client
// boundary.

type RitualPickFromApi = {
  step: string;
  product: {
    id: string;
    sku: string;
    name: string;
    slug: string;
    priceEur: number;
    imageUrl: string | null;
    ingredientSlugs: string[];
  } | null;
  matchedIngredients: string[];
};

type QuizApiResult = {
  ritual: RitualPickFromApi[];
  brief: {
    skinType: string;
    primaryConcern: string;
    secondaryConcerns: string[];
    reactivity: string;
    sunExposure: string;
    ageBand: string;
    ritualDepth: string;
    linePreference: string;
    needsSpf: boolean;
  };
};

// ─── Component ──────────────────────────────────────────────────────────

export function QuizTester() {
  // Default to a "common case" customer so a fresh admin sees results
  // immediately on first load — saves a click and gives them a baseline
  // to vary from.
  const [skinType, setSkinType] = useState<string>("dry");
  const [primaryConcern, setPrimaryConcern] = useState<string>("hydration");
  const [secondaryConcerns, setSecondaryConcerns] = useState<string[]>([]);
  const [reactivity, setReactivity] = useState<string>("sometimes");
  const [sunExposure, setSunExposure] = useState<string>("commute");
  const [ageBand, setAgeBand] = useState<string>("25-34");
  const [ritualDepth, setRitualDepth] = useState<string>("balanced");

  const [result, setResult] = useState<QuizApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function simulate() {
    setError(null);
    const answers = {
      skinType,
      primaryConcern,
      secondaryConcerns,
      reactivity,
      sunExposure,
      ageBand,
      ritualDepth,
    };
    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Admin always tests against EN catalogue — most consistent for
          // QA. Customers see their own locale at /[locale]/quiz; that
          // path isn't impacted by this tester.
          body: JSON.stringify({ answers, locale: "en" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        }
        const data = (await res.json()) as QuizApiResult;
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setResult(null);
      }
    });
  }

  function toggleSecondary(id: string) {
    setSecondaryConcerns((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function resetDefaults() {
    setSkinType("dry");
    setPrimaryConcern("hydration");
    setSecondaryConcerns([]);
    setReactivity("sometimes");
    setSunExposure("commute");
    setAgeBand("25-34");
    setRitualDepth("balanced");
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-10">
      {/* ── Inputs ─────────────────────────────────────────────────────── */}
      <section className="border border-ink/10 bg-white/60 p-6 md:p-8">
        <h2 className="font-display text-[20px] text-ink">Customer profile</h2>
        <p className="mt-1 text-[12px] text-ink-mid">
          Same 7 questions as the public quiz — change any answer and click
          Simulate to see what the engine recommends.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Field label="Skin type">
            <PillGroup
              options={SKIN_TYPES}
              value={skinType}
              onChange={setSkinType}
            />
          </Field>

          <Field label="Primary concern">
            <PillGroup
              options={PRIMARY_CONCERNS}
              value={primaryConcern}
              onChange={setPrimaryConcern}
            />
          </Field>

          <Field label="Secondary concerns (multi-select)" colSpan={2}>
            <PillGroup
              options={SECONDARY_CONCERNS}
              value={secondaryConcerns}
              onChange={toggleSecondary}
              multi
            />
          </Field>

          <Field label="Reactivity">
            <PillGroup
              options={REACTIVITY}
              value={reactivity}
              onChange={setReactivity}
            />
          </Field>

          <Field label="Sun exposure">
            <PillGroup
              options={SUN_EXPOSURE}
              value={sunExposure}
              onChange={setSunExposure}
            />
          </Field>

          <Field label="Age band">
            <PillGroup
              options={AGE_BANDS}
              value={ageBand}
              onChange={setAgeBand}
            />
          </Field>

          <Field label="Ritual depth">
            <PillGroup
              options={RITUAL_DEPTHS}
              value={ritualDepth}
              onChange={setRitualDepth}
            />
          </Field>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            onClick={simulate}
            disabled={pending}
            className="inline-flex items-center gap-2 bg-ink px-5 py-2.5 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {pending ? "Running…" : "Simulate"}
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            className="inline-flex items-center gap-2 border border-ink/20 bg-white px-4 py-2.5 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </section>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 border border-vermilion/30 bg-vermilion/5 p-4 text-[12px] text-vermilion">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold uppercase tracking-label">
              Simulation failed
            </div>
            <div className="mt-1 font-mono">{error}</div>
          </div>
        </div>
      )}

      {/* ── Brief recap ────────────────────────────────────────────────── */}
      {result && (
        <section className="border border-ink/10 bg-white/60 p-6 md:p-8">
          <h2 className="font-display text-[18px] text-ink">
            What the engine inferred
          </h2>
          <p className="mt-1 text-[12px] text-ink-mid">
            After validation + reactivity bump + age-line preference.
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] md:grid-cols-4">
            <Row label="Skin" value={result.brief.skinType} />
            <Row label="Primary" value={result.brief.primaryConcern} />
            <Row
              label="Secondary"
              value={
                result.brief.secondaryConcerns.length === 0
                  ? "—"
                  : result.brief.secondaryConcerns.join(", ")
              }
            />
            <Row label="Reactivity" value={result.brief.reactivity} />
            <Row label="Sun" value={result.brief.sunExposure} />
            <Row label="Age" value={result.brief.ageBand} />
            <Row label="Depth" value={result.brief.ritualDepth} />
            <Row
              label="Line preference"
              value={result.brief.linePreference}
              highlight
            />
            <Row
              label="Needs SPF?"
              value={result.brief.needsSpf ? "yes" : "no"}
            />
          </dl>
        </section>
      )}

      {/* ── Results ────────────────────────────────────────────────────── */}
      {result && (
        <section>
          <h2 className="font-display text-[20px] text-ink">
            Recommended ritual
          </h2>
          <p className="mt-1 text-[12px] text-ink-mid">
            One card per step in the inferred routine depth. Empty cards mean
            the engine couldn&apos;t find a product for that step — usually
            because no published product is tagged with that step&apos;s
            categories. Click &quot;Edit tags&quot; on any pick to adjust
            its admin record.
          </p>

          <ul className="mt-6 grid gap-4 lg:grid-cols-2">
            {result.ritual.map((pick, idx) => (
              <PickCard key={`${pick.step}-${idx}`} pick={pick} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function Field({
  label,
  children,
  colSpan,
}: {
  label: string;
  children: React.ReactNode;
  colSpan?: 2;
}) {
  return (
    <div className={cn(colSpan === 2 && "md:col-span-2")}>
      <div className="text-[10px] uppercase tracking-label text-ink-mid">
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function PillGroup<T extends { id: string; label: string }>({
  options,
  value,
  onChange,
  multi = false,
}: {
  options: readonly T[];
  value: string | string[];
  onChange: (id: string) => void;
  multi?: boolean;
}) {
  const selectedSet = new Set(Array.isArray(value) ? value : [value]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const selected = selectedSet.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={selected}
            className={cn(
              "border px-3 py-1.5 text-[12px] transition-colors",
              selected
                ? "border-ink bg-ink text-rice"
                : "border-ink/15 bg-white text-ink-mid hover:border-ink hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
      {multi && (
        <span className="ml-1 self-center text-[10px] uppercase tracking-label text-ink-mid/70">
          tap to toggle
        </span>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-label text-ink-mid">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-[13px]",
          highlight ? "font-display text-vermilion" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function PickCard({ pick }: { pick: RitualPickFromApi }) {
  const stepLabel = STEP_LABEL[pick.step] ?? pick.step;

  // Empty pick = the engine couldn't find a product. Render a quiet
  // placeholder so admin can immediately see WHICH step is missing and
  // act on it (tag a product to that category, or accept the gap).
  if (!pick.product) {
    return (
      <li className="border border-dashed border-vermilion/40 bg-vermilion/5 p-5">
        <div className="text-[10px] uppercase tracking-label text-vermilion">
          {stepLabel}
        </div>
        <div className="mt-2 text-[14px] text-ink">
          No product found for this step.
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
          No published product matches any of this step&apos;s category
          slugs. Open <Link
            href="/admin/products"
            className="underline decoration-vermilion/40 underline-offset-2 hover:text-vermilion"
          >
            /admin/products
          </Link>{" "}
          and add the missing category tag to a relevant product.
        </p>
      </li>
    );
  }

  const matched = pick.matchedIngredients;

  return (
    <li className="border border-ink/10 bg-white/60 p-5">
      <div className="flex items-start gap-4">
        {pick.product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pick.product.imageUrl}
            alt=""
            className="h-20 w-16 shrink-0 object-cover"
          />
        ) : (
          <div className="h-20 w-16 shrink-0 bg-ink/5" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-label text-ink-mid">
            {stepLabel}
          </div>
          <div className="mt-1 font-display text-[16px] leading-tight text-ink">
            {pick.product.name}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-ink-mid">
            {pick.product.sku} · €{pick.product.priceEur.toFixed(2)}
          </div>

          {/* Matched ingredients — the "why this pick" detail. Empty means
              the product won this step on tie-break (alphabetical /
              bestseller order) rather than on a real ingredient signal,
              which is a hint that the brief has no scoring signal for
              this product's tagging. */}
          {matched.length > 0 ? (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-label text-ink-mid">
                Matched on
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {matched.map((slug) => (
                  <span
                    key={slug}
                    className="border border-sage/40 bg-sage/5 px-2 py-0.5 text-[11px] text-sage"
                  >
                    {slug}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-[11px] italic text-ink-mid">
              No ingredient matches — won this step on default ordering.
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/admin/products/${pick.product.id}?tab=organise`}
              className="inline-flex items-center gap-1 border border-ink/20 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink"
            >
              Edit tags
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
            <Link
              href={`/en/shop/${pick.product.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border border-ink/20 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink"
            >
              View PDP
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}
