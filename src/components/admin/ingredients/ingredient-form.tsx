"use client";

// ─────────────────────────────────────────────────────────────────────────
// IngredientForm — shared between /admin/ingredients/new and /[id].
//
// Layout:
//   · Identity fieldset — slug, INCI name, key-asset + allergen flags
//   · Translations fieldset — one block per EN/NL/FR/RU with display name
//     and description (plain textarea; the public page already accepts
//     HTML so paste from Tiptap works, but a plain textarea is the lowest-
//     friction surface for an admin's first editorial pass).
//
// Only EN is required. Other locales fall back to EN on the public site
// (see getIngredientBySlug + listActiveIngredients).
//
// Each non-EN locale block has an "Auto-translate from English" button
// (DeepL-backed). It reads the EN inputs that are sitting in the same
// form (no save needed first — they're right there in the DOM) and
// fills the locale's empty fields with translations.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useRef } from "react";
import { Locale } from "@prisma/client";
import {
  createIngredientAction,
  updateIngredientAction,
  type ActionState,
} from "@/app/admin/ingredients/actions";
import {
  Field,
  SaveBar,
  StatusBanner,
} from "@/components/admin/settings/settings-chrome";
import { TranslateFromEnglishButton } from "@/components/admin/translate-button";
import { setNativeInputValue } from "@/lib/admin/native-input";

const INITIAL_STATE: ActionState = { ok: false };

const LOCALE_LABEL: Record<Locale, string> = {
  EN: "English",
  NL: "Dutch",
  FR: "French",
  RU: "Russian",
};

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

export type IngredientFormValues = {
  id?: string;
  slug: string;
  inciName: string;
  isKeyAsset: boolean;
  isAllergen: boolean;
  translations: Record<
    Locale,
    { displayName: string; description: string } | null
  >;
};

/** Field keys we feed through DeepL. `displayName` and `description`
 *  are both translatable; `description` carries HTML and gets the
 *  tag_handling=html flag on the DeepL side. */
const TRANSLATABLE_FIELDS: ReadonlyArray<{
  key: "displayName" | "description";
  isHtml: boolean;
}> = [
  { key: "displayName", isHtml: false },
  { key: "description", isHtml: true },
];

export function IngredientForm({
  mode,
  values,
}: {
  mode: "create" | "edit";
  values: IngredientFormValues;
}) {
  const action =
    mode === "create" ? createIngredientAction : updateIngredientAction;
  const [state, dispatch] = useActionState(action, INITIAL_STATE);

  // Refs to every translation input — keyed `${locale}.${field}` so the
  // auto-translate button can read EN and write into a target locale
  // without prop-drilling state. Inputs stay uncontrolled (defaultValue)
  // for everything else; only the auto-translate button mutates them.
  const inputRefs = useRef<
    Record<string, HTMLInputElement | HTMLTextAreaElement | null>
  >({});

  function setInputValue(locale: Locale, key: string, value: string) {
    setNativeInputValue(inputRefs.current[`${locale}.${key}`], value);
  }

  function getEnSource(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of TRANSLATABLE_FIELDS) {
      const el = inputRefs.current[`${Locale.EN}.${f.key}`];
      out[f.key] = el?.value ?? "";
    }
    return out;
  }

  return (
    <form action={dispatch} className="space-y-10">
      {mode === "edit" && values.id && (
        <input type="hidden" name="id" value={values.id} />
      )}

      {/* ── identity ─────────────────────────────────────────────── */}
      <fieldset className="border border-ink/10 bg-white/60 p-6">
        <legend className="px-1 font-display text-[18px] text-ink">
          Identity
        </legend>

        <div className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Field
            label="INCI name"
            hint="Exactly as it appears on the INCI register — e.g. Centella Asiatica Extract."
            error={errMsg(state, "inciName")}
          >
            <input
              name="inciName"
              defaultValue={values.inciName}
              className="input"
              maxLength={160}
              required
              placeholder="Centella Asiatica Extract"
            />
          </Field>

          <Field
            label="URL slug"
            hint="Lowercase, hyphens only. Used at /ingredients/[slug]."
            error={errMsg(state, "slug")}
          >
            <input
              name="slug"
              defaultValue={values.slug}
              className="input font-mono text-[13px]"
              maxLength={80}
              required
              placeholder="centella-asiatica"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
          </Field>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <ToggleRow
            name="isKeyAsset"
            label="Key active"
            hint="Feature on /ingredients and surface as a card on product detail pages."
            defaultChecked={values.isKeyAsset}
          />
          <ToggleRow
            name="isAllergen"
            label="Potential allergen"
            hint="Flags this ingredient for sensitive customers on product pages."
            defaultChecked={values.isAllergen}
          />
        </div>
      </fieldset>

      {/* ── translations ─────────────────────────────────────────── */}
      <fieldset className="border border-ink/10 bg-white/60 p-6">
        <legend className="px-1 font-display text-[18px] text-ink">
          Translations
        </legend>
        <p className="-mt-1 mb-6 text-[12px] leading-relaxed text-ink-mid">
          English is required — it's the fallback for every visitor. For
          any other language, leave the display name blank to skip that
          translation entirely. Use the &ldquo;Translate from EN&rdquo;
          button on each non-English block to auto-fill from your English
          copy.
        </p>

        <div className="space-y-8">
          {LOCALES.map((locale) => {
            const v = values.translations[locale] ?? {
              displayName: "",
              description: "",
            };
            const isEn = locale === Locale.EN;
            return (
              <div
                key={locale}
                className="border border-ink/5 bg-rice/20 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-mono text-[11px] uppercase tracking-label text-ink-mid">
                    {LOCALE_LABEL[locale]}
                  </div>
                  {isEn ? (
                    <span className="text-[10px] uppercase tracking-label text-vermilion">
                      Required
                    </span>
                  ) : (
                    <TranslateFromEnglishButton
                      compact
                      targetLocale={locale}
                      fields={TRANSLATABLE_FIELDS.map((f) => ({
                        name: f.key,
                        isHtml: f.isHtml,
                        currentValue:
                          inputRefs.current[`${locale}.${f.key}`]?.value ??
                          v[f.key],
                      }))}
                      getSource={getEnSource}
                      onTranslated={(translations) => {
                        for (const [key, value] of Object.entries(
                          translations,
                        )) {
                          setInputValue(locale, key, value);
                        }
                      }}
                    />
                  )}
                </div>

                <div className="mt-4 space-y-4">
                  <Field
                    label="Display name"
                    hint={
                      isEn
                        ? "What customers see on the page — often more readable than the INCI name (e.g. 'Centella' instead of 'Centella Asiatica Extract')."
                        : "Localised version of the display name. Skip if you haven't translated yet."
                    }
                    error={errMsg(state, `translations.${locale}.displayName`)}
                  >
                    <input
                      ref={(el) => {
                        inputRefs.current[`${locale}.displayName`] = el;
                      }}
                      name={`translations.${locale}.displayName`}
                      defaultValue={v.displayName}
                      maxLength={120}
                      className="input"
                      placeholder={isEn ? "Centella" : undefined}
                    />
                  </Field>

                  <Field
                    label="Description (rich text or HTML)"
                    hint="What it does, why it's in the formula. Plain paragraphs, or paste HTML from your editor of choice."
                    error={errMsg(state, `translations.${locale}.description`)}
                  >
                    <textarea
                      ref={(el) => {
                        inputRefs.current[`${locale}.description`] = el;
                      }}
                      name={`translations.${locale}.description`}
                      defaultValue={v.description}
                      rows={6}
                      maxLength={4000}
                      className="input font-mono text-[12.5px] leading-relaxed"
                      placeholder={
                        isEn
                          ? "<p>A quiet powerhouse for reactive skin — calms, supports the barrier, speeds repair.</p>"
                          : undefined
                      }
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}

function ToggleRow({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 accent-vermilion"
      />
      <span className="flex-1">
        <span className="block text-[12px] uppercase tracking-label text-ink">
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] text-ink-mid">{hint}</span>
      </span>
    </label>
  );
}

function errMsg(state: ActionState, key: string): string | undefined {
  return state.fieldErrors?.[key]?.[0];
}
