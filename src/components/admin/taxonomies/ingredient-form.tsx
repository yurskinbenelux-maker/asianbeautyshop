// ─────────────────────────────────────────────────────────────────────────
// IngredientForm — shared between /new and /[id].
// Core scalar: INCI name (unique-ish, scientific). Per-locale: displayName
// (customer-friendly, e.g. "Niacinamide" vs "Niacinamide (Vitamin B3)")
// and a short description used on product ingredient breakdowns.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  ShieldAlert,
  Star,
} from "lucide-react";
import { Locale } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  createIngredientAction,
  updateIngredientAction,
  type ActionState,
} from "@/app/admin/categories/actions";

const INITIAL: ActionState = { ok: false };
const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

export type IngredientFormInitial = {
  id?: string;
  slug?: string;
  inciName?: string;
  isKeyAsset?: boolean;
  isAllergen?: boolean;
  translations: Partial<
    Record<Locale, { displayName: string | null; description: string | null }>
  >;
};

export function IngredientForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial: IngredientFormInitial;
}) {
  const [state, action] = useActionState(
    mode === "create" ? createIngredientAction : updateIngredientAction,
    INITIAL,
  );
  const err = state.fieldErrors ?? {};
  const [active, setActive] = useState<Locale>(Locale.EN);

  return (
    <form
      action={action}
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="space-y-8">
        <Field
          label="INCI name"
          hint="The scientific name as it appears on the ingredient label."
          error={err.inciName?.[0]}
        >
          <input
            name="inciName"
            defaultValue={initial.inciName ?? ""}
            placeholder="e.g. Niacinamide"
            className="input"
            required
          />
        </Field>

        <div>
          <div className="flex items-center gap-1 border-b border-ink/10">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setActive(l)}
                aria-pressed={active === l}
                className={cn(
                  "border-b-2 px-3 py-2 text-[11px] uppercase tracking-label transition-colors",
                  active === l
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-mid hover:text-ink",
                )}
              >
                {l}
              </button>
            ))}
          </div>

          {LOCALES.map((l) => (
            <div
              key={l}
              className={cn("space-y-5 pt-6", active !== l && "hidden")}
            >
              <Field
                label={`Display name (${l})`}
                hint="What customers see. Leave blank to fall back to INCI."
              >
                <input
                  name={`translations.${l}.displayName`}
                  defaultValue={initial.translations[l]?.displayName ?? ""}
                  placeholder="e.g. Niacinamide (Vitamin B3)"
                  className="input"
                />
              </Field>

              <Field
                label={`Short description (${l})`}
                hint="Appears under the ingredient on product pages."
              >
                <textarea
                  name={`translations.${l}.description`}
                  rows={5}
                  defaultValue={initial.translations[l]?.description ?? ""}
                  placeholder="e.g. Brightens and evens skin tone, calms redness."
                  className="input"
                />
              </Field>
            </div>
          ))}
        </div>

        {state.message && (
          <p
            className={cn(
              "inline-flex items-center gap-2 border px-3 py-2 text-[12px]",
              state.ok
                ? "border-sage/30 bg-sage/5 text-sage"
                : "border-vermilion/30 bg-vermilion/5 text-vermilion",
            )}
            role="status"
            aria-live="polite"
          >
            {state.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {state.message}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-ink/10 pt-6">
          <SubmitButton>
            <Save className="h-3.5 w-3.5" />
            {mode === "create" ? "Create ingredient" : "Save changes"}
          </SubmitButton>
        </div>
      </div>

      <aside className="space-y-6">
        <fieldset className="border border-ink/10 bg-white/60 p-5">
          <legend className="eyebrow px-2">Metadata</legend>
          <div className="space-y-4 pt-3">
            <Field label="Slug" error={err.slug?.[0]}>
              <input
                name="slug"
                defaultValue={initial.slug ?? ""}
                placeholder="auto-generated from INCI"
                className="input"
              />
            </Field>

            <label className="flex items-start gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                name="isKeyAsset"
                defaultChecked={initial.isKeyAsset ?? false}
                className="mt-0.5 h-3.5 w-3.5 accent-gold"
              />
              <span>
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 text-gold" />
                  Key asset
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-mid">
                  Features this ingredient in product hero blocks and the AI
                  assistant's "hero INCIs" rankings.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                name="isAllergen"
                defaultChecked={initial.isAllergen ?? false}
                className="mt-0.5 h-3.5 w-3.5 accent-vermilion"
              />
              <span>
                <span className="flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3 text-vermilion" />
                  Allergen
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-mid">
                  Flags the ingredient so sensitive-skin customers can filter
                  it out.
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      </aside>
    </form>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-[11px] text-ink-mid/80">{hint}</span>
      )}
      {error && <span className="mt-1 block text-[11px] text-vermilion">{error}</span>}
    </label>
  );
}
