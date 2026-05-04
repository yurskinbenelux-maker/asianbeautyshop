// ─────────────────────────────────────────────────────────────────────────
// BrandForm — used by /admin/categories/brands/new and /.../[id].
// Similar shape to CategoryForm but with Brand-specific fields
// (name as core scalar, tagline + story per locale).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
} from "lucide-react";
import { Locale } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  createBrandAction,
  updateBrandAction,
  type ActionState,
} from "@/app/admin/categories/actions";
import { TranslateFromEnglishButton } from "@/components/admin/translate-button";
import { setNativeInputValue } from "@/lib/admin/native-input";

const INITIAL: ActionState = { ok: false };
const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

const TRANSLATABLE_FIELDS: ReadonlyArray<{
  name: "tagline" | "story";
  isHtml: boolean;
}> = [
  { name: "tagline", isHtml: false },
  { name: "story", isHtml: true }, // hint says "supports basic HTML"
];

export type BrandFormInitial = {
  id?: string;
  slug?: string;
  name?: string;
  isActive?: boolean;
  translations: Partial<Record<Locale, { tagline: string | null; story: string | null }>>;
};

export function BrandForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial: BrandFormInitial;
}) {
  const [state, action] = useActionState(
    mode === "create" ? createBrandAction : updateBrandAction,
    INITIAL,
  );
  const err = state.fieldErrors ?? {};
  const [active, setActive] = useState<Locale>(Locale.EN);

  const inputRefs = useRef<
    Record<string, HTMLInputElement | HTMLTextAreaElement | null>
  >({});

  function getEnSource(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of TRANSLATABLE_FIELDS) {
      out[f.name] = inputRefs.current[`EN.${f.name}`]?.value ?? "";
    }
    return out;
  }

  function applyTranslations(
    locale: Locale,
    translations: Record<string, string>,
  ) {
    for (const [name, value] of Object.entries(translations)) {
      setNativeInputValue(inputRefs.current[`${locale}.${name}`], value);
    }
  }

  return (
    <form
      action={action}
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="space-y-8">
        <Field label="Brand name" error={err.name?.[0]}>
          <input
            name="name"
            defaultValue={initial.name ?? ""}
            placeholder="e.g. Beauty of Joseon"
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
              {l !== Locale.EN && (
                <TranslateFromEnglishButton
                  targetLocale={l}
                  fields={TRANSLATABLE_FIELDS.map((f) => ({
                    name: f.name,
                    isHtml: f.isHtml,
                    currentValue:
                      inputRefs.current[`${l}.${f.name}`]?.value ??
                      (initial.translations[l]?.[f.name] ?? ""),
                  }))}
                  getSource={getEnSource}
                  onTranslated={(tr) => applyTranslations(l, tr)}
                />
              )}

              <Field label="Tagline (optional)">
                <input
                  ref={(el) => {
                    inputRefs.current[`${l}.tagline`] = el;
                  }}
                  name={`translations.${l}.tagline`}
                  defaultValue={initial.translations[l]?.tagline ?? ""}
                  placeholder="One sentence above the brand story."
                  className="input"
                />
              </Field>

              <Field label="Brand story (optional, supports basic HTML)">
                <textarea
                  ref={(el) => {
                    inputRefs.current[`${l}.story`] = el;
                  }}
                  name={`translations.${l}.story`}
                  rows={8}
                  defaultValue={initial.translations[l]?.story ?? ""}
                  placeholder="Longer narrative shown on /brands/[slug]."
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
            {mode === "create" ? "Create brand" : "Save changes"}
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
                placeholder="auto-generated from name"
                className="input"
              />
            </Field>
            <label className="flex items-center gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={initial.isActive ?? true}
                className="h-3.5 w-3.5 accent-ink"
              />
              Live on the shop
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
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-vermilion">{error}</span>}
    </label>
  );
}
