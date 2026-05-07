// ─────────────────────────────────────────────────────────────────────────
// CategoryForm — the "New category" / "Edit category" form.
//
// Two modes driven by the `mode` prop:
//   • "create" — posts to createCategoryAction
//   • "edit"   — posts to updateCategoryAction
//
// Each translation is its own tab so an admin is never looking at four
// description boxes at once. EN is required; NL/FR/RU inherit EN on the
// public site when left blank.
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
  createCategoryAction,
  updateCategoryAction,
  type ActionState,
} from "@/app/admin/categories/actions";
import { TranslateFromEnglishButton } from "@/components/admin/translate-button";
import { setNativeInputValue } from "@/lib/admin/native-input";

const INITIAL: ActionState = { ok: false };
const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

const TRANSLATABLE_FIELDS: ReadonlyArray<{
  name: "name" | "description" | "seoTitle" | "seoDescription";
  isHtml: boolean;
}> = [
  { name: "name", isHtml: false },
  { name: "description", isHtml: false },
  { name: "seoTitle", isHtml: false },
  { name: "seoDescription", isHtml: false },
];

export type CategoryFormInitial = {
  id?: string;
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  translations: Partial<
    Record<
      Locale,
      {
        name: string;
        description: string | null;
        seoTitle?: string | null;
        seoDescription?: string | null;
      }
    >
  >;
};

export type ParentOption = {
  id: string;
  slug: string;
  label: string;
  depthHint?: string; // e.g. "> " prefix to hint hierarchy; optional
};

export function CategoryForm({
  mode,
  initial,
  parentOptions,
}: {
  mode: "create" | "edit";
  initial: CategoryFormInitial;
  parentOptions: ParentOption[];
}) {
  const [state, action] = useActionState(
    mode === "create" ? createCategoryAction : updateCategoryAction,
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
    <form action={action} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      {/* LEFT — translations + meta */}
      <div className="space-y-8">
        {/* translation tab strip */}
        <div>
          <div className="flex items-center gap-1 border-b border-ink/10">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setActive(l)}
                className={cn(
                  "border-b-2 px-3 py-2 text-[11px] uppercase tracking-label transition-colors",
                  active === l
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-mid hover:text-ink",
                )}
                aria-pressed={active === l}
              >
                {l}
                {l === Locale.EN && (
                  <span className="ml-1 text-vermilion" aria-label="required">
                    *
                  </span>
                )}
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

              <Field label="Name" error={l === Locale.EN ? err["translations.EN.name"]?.[0] : undefined}>
                <input
                  ref={(el) => {
                    inputRefs.current[`${l}.name`] = el;
                  }}
                  name={`translations.${l}.name`}
                  defaultValue={initial.translations[l]?.name ?? ""}
                  placeholder={
                    l === Locale.EN
                      ? "e.g. Cleansers"
                      : "Leave blank to inherit English"
                  }
                  className="input"
                />
              </Field>

              <Field label="Description (optional)">
                <textarea
                  ref={(el) => {
                    inputRefs.current[`${l}.description`] = el;
                  }}
                  name={`translations.${l}.description`}
                  rows={4}
                  defaultValue={initial.translations[l]?.description ?? ""}
                  placeholder="Short intro shown at the top of the category page."
                  className="input"
                />
              </Field>

              <Field label="SEO title">
                <input
                  ref={(el) => {
                    inputRefs.current[`${l}.seoTitle`] = el;
                  }}
                  name={`translations.${l}.seoTitle`}
                  defaultValue={initial.translations[l]?.seoTitle ?? ""}
                  placeholder="Defaults to the category name + shop name."
                  className="input"
                />
              </Field>

              <Field label="SEO description">
                <textarea
                  ref={(el) => {
                    inputRefs.current[`${l}.seoDescription`] = el;
                  }}
                  name={`translations.${l}.seoDescription`}
                  rows={3}
                  defaultValue={initial.translations[l]?.seoDescription ?? ""}
                  placeholder="~ 160 characters."
                  className="input"
                />
              </Field>
            </div>
          ))}
        </div>

        {/* status banner */}
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
            {mode === "create" ? "Create category" : "Save changes"}
          </SubmitButton>
        </div>
      </div>

      {/* RIGHT — meta */}
      <aside className="space-y-6">
        <fieldset className="border border-ink/10 bg-white/60 p-5">
          <legend className="eyebrow px-2">Metadata</legend>

          <div className="space-y-4 pt-3">
            <Field label="Slug" error={err.slug?.[0]}>
              <input
                name="slug"
                defaultValue={initial.slug ?? ""}
                placeholder="auto-generated from English name"
                className="input"
              />
            </Field>

            <Field label="Parent">
              <select
                name="parentId"
                defaultValue={initial.parentId ?? ""}
                className="input"
              >
                <option value="">— No parent (top-level)</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.depthHint ?? ""}
                    {p.label} · /{p.slug}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Sort order">
              <input
                type="number"
                name="sortOrder"
                min={0}
                defaultValue={initial.sortOrder ?? 0}
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

// ──────── shared bits ───────────────────────────────────────────────────

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
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
