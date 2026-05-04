"use client";

// ─────────────────────────────────────────────────────────────────────────
// TestimonialForm — shared between /admin/testimonials/new and /[id].
//
// Layout:
//   · "Display" fieldset on the left (rating, sort order, flags)
//   · "Translations" fieldset below — one row per EN/NL/FR/RU with a
//     stacked quote / author / product input group.
//   · Only EN is required; the others fall back to EN on the public site
//     (see listActiveTestimonials).
//
// Submits to createTestimonialAction or updateTestimonialAction based on
// `mode`. Both actions have identical ActionState shapes so we can share
// the dispatch wiring.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useRef } from "react";
import { Locale } from "@prisma/client";
import {
  createTestimonialAction,
  updateTestimonialAction,
  type ActionState,
} from "@/app/admin/testimonials/actions";
import {
  Field,
  SaveBar,
  StatusBanner,
} from "@/components/admin/settings/settings-chrome";
import { TranslateFromEnglishButton } from "@/components/admin/translate-button";

const INITIAL_STATE: ActionState = { ok: false };

const TRANSLATABLE_FIELDS: ReadonlyArray<{
  name: "quote" | "authorName" | "productName";
  isHtml: boolean;
}> = [
  { name: "quote", isHtml: false },
  { name: "authorName", isHtml: false },
  { name: "productName", isHtml: false },
];

const LOCALE_LABEL: Record<Locale, string> = {
  EN: "English",
  NL: "Dutch",
  FR: "French",
  RU: "Russian",
};

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

export type TestimonialFormValues = {
  id?: string;
  rating: number;
  sortOrder: number;
  isActive: boolean;
  verified: boolean;
  translations: Record<
    Locale,
    { quote: string; authorName: string; productName: string } | null
  >;
};

export function TestimonialForm({
  mode,
  values,
}: {
  mode: "create" | "edit";
  values: TestimonialFormValues;
}) {
  // Shared action-state shape — both actions return the same contract.
  const action = mode === "create" ? createTestimonialAction : updateTestimonialAction;
  const [state, dispatch] = useActionState(action, INITIAL_STATE);

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
      const el = inputRefs.current[`${locale}.${name}`];
      if (el) el.value = value;
    }
  }

  return (
    <form action={dispatch} className="space-y-10">
      {/* carry the id through on edit so the action knows which row */}
      {mode === "edit" && values.id && (
        <input type="hidden" name="id" value={values.id} />
      )}

      {/* ── display settings ─────────────────────────────────────── */}
      <fieldset className="border border-ink/10 bg-white/60 p-6">
        <legend className="px-1 font-display text-[18px] text-ink">
          Display
        </legend>

        <div className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-3">
          <Field
            label="Rating"
            hint="1 to 5. Shown as a dot row on the card."
            error={errMsg(state, "rating")}
          >
            <input
              type="number"
              name="rating"
              min={1}
              max={5}
              step={1}
              defaultValue={values.rating}
              className="input"
              required
            />
          </Field>

          <Field
            label="Sort order"
            hint="Lower numbers appear first on the homepage."
            error={errMsg(state, "sortOrder")}
          >
            <input
              type="number"
              name="sortOrder"
              min={0}
              max={9999}
              step={1}
              defaultValue={values.sortOrder}
              className="input"
              required
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 pt-1">
            <ToggleRow
              name="isActive"
              label="Active"
              hint="Hide from the homepage without deleting."
              defaultChecked={values.isActive}
            />
            <ToggleRow
              name="verified"
              label="Verified purchase"
              hint="Shows the sage verified chip under the author."
              defaultChecked={values.verified}
            />
          </div>
        </div>
      </fieldset>

      {/* ── translations ─────────────────────────────────────────── */}
      <fieldset className="border border-ink/10 bg-white/60 p-6">
        <legend className="px-1 font-display text-[18px] text-ink">
          Translations
        </legend>
        <p className="-mt-1 mb-6 text-[12px] leading-relaxed text-ink-mid">
          English is the fallback for every visitor — it's required. For any
          other language, leave every field blank to skip that language, or
          fill in at least the quote and author to publish it.
        </p>

        <div className="space-y-8">
          {LOCALES.map((locale) => {
            const v = values.translations[locale] ?? {
              quote: "",
              authorName: "",
              productName: "",
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
                        name: f.name,
                        isHtml: f.isHtml,
                        currentValue:
                          inputRefs.current[`${locale}.${f.name}`]?.value ??
                          (v[f.name] ?? ""),
                      }))}
                      getSource={getEnSource}
                      onTranslated={(tr) => applyTranslations(locale, tr)}
                    />
                  )}
                </div>

                <div className="mt-4 space-y-4">
                  <Field
                    label="Quote"
                    hint="Customer's own words, as short as possible."
                    error={errMsg(state, `translations.${locale}.quote`)}
                  >
                    <textarea
                      ref={(el) => {
                        inputRefs.current[`${locale}.quote`] = el;
                      }}
                      name={`translations.${locale}.quote`}
                      defaultValue={v.quote}
                      rows={3}
                      maxLength={400}
                      className="input leading-relaxed"
                      placeholder={
                        isEn
                          ? "e.g. My skin stopped reacting. First product I've trusted in years."
                          : undefined
                      }
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field
                      label="Author"
                      hint="e.g. M. — Brussels. Kept small to protect privacy."
                      error={errMsg(state, `translations.${locale}.authorName`)}
                    >
                      <input
                        ref={(el) => {
                          inputRefs.current[`${locale}.authorName`] = el;
                        }}
                        name={`translations.${locale}.authorName`}
                        defaultValue={v.authorName}
                        maxLength={80}
                        className="input"
                      />
                    </Field>
                    <Field
                      label="Product (optional)"
                      hint="The product this quote refers to. Leave blank if generic."
                      error={errMsg(state, `translations.${locale}.productName`)}
                    >
                      <input
                        ref={(el) => {
                          inputRefs.current[`${locale}.productName`] = el;
                        }}
                        name={`translations.${locale}.productName`}
                        defaultValue={v.productName}
                        maxLength={80}
                        className="input"
                        placeholder="e.g. Ginseng Essence"
                      />
                    </Field>
                  </div>
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

/** Small labelled toggle — stacked label above checkbox + hint. */
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
        // Tailwind's accent utility keeps the native checkbox but skins it
        // to the brand vermilion.
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
