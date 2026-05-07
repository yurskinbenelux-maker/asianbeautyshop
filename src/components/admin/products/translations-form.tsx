// ─────────────────────────────────────────────────────────────────────────
// TranslationsForm — one panel per locale (EN · NL · FR · RU).
//
// Each locale is its own <form> posting to updateTranslation. That means
// Sofia can save EN without having filled in RU yet, errors in one locale
// don't roll back the others, and the diff stays small.
//
// On non-EN tabs we surface an "Auto-translate from English" button
// (DeepL-backed) that fills empty fields with translations of the
// currently-saved EN copy. EN stays the source of truth — the button
// never appears on the EN tab.
//
// Rich text: for now we ship plain <textarea> so the whole editor works
// today. Tiptap (WYSIWYG) will swap in later behind this same contract
// — the stored value is HTML either way.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Locale } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  updateTranslation,
  type ActionState,
} from "@/app/admin/products/actions";
import { TranslateFromEnglishButton } from "@/components/admin/translate-button";
import { AiPolishTranslationButton } from "@/components/admin/products/ai-polish-translation";
import { setNativeInputValue } from "@/lib/admin/native-input";

export type TranslationData = {
  locale: Locale;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  howToUse: string;
  /** Per-locale safety / regulatory copy from the supplier sheet. */
  warnings: string;
  seoTitle: string;
  seoDescription: string;
};

const INITIAL_STATE: ActionState = { ok: true };

const LOCALE_LABEL: Record<Locale, string> = {
  EN: "English",
  NL: "Dutch",
  FR: "French",
  RU: "Russian",
};

/** Field keys we feed through DeepL. `slug` is excluded — slugs are
 *  url-shaped and we'd rather Sofia derives them from the translated
 *  name herself than have DeepL guess. */
const TRANSLATABLE_FIELDS: ReadonlyArray<{
  name: keyof TranslationData;
  isHtml: boolean;
}> = [
  { name: "name", isHtml: false },
  { name: "shortDescription", isHtml: false },
  { name: "description", isHtml: true },
  { name: "howToUse", isHtml: true },
  { name: "warnings", isHtml: false },
  { name: "seoTitle", isHtml: false },
  { name: "seoDescription", isHtml: false },
];

export function TranslationsForm({
  productId,
  translations,
}: {
  productId: string;
  translations: TranslationData[];
}) {
  // Panel state: which locale tab is active. Start on EN.
  const [active, setActive] = useState<Locale>(Locale.EN);
  const current = translations.find((t) => t.locale === active)!;
  const enValues = translations.find((t) => t.locale === Locale.EN);

  return (
    <div>
      {/* locale sub-tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {translations.map((t) => {
          const filled = t.name.trim() !== "";
          const isActive = t.locale === active;
          return (
            <button
              key={t.locale}
              type="button"
              onClick={() => setActive(t.locale)}
              className={cn(
                "inline-flex items-center gap-2 border px-3 py-1.5 text-[11px] uppercase tracking-label transition-colors",
                isActive
                  ? "border-ink bg-ink text-white"
                  : "border-ink/15 text-ink-mid hover:border-ink hover:text-ink",
              )}
            >
              <span>{t.locale}</span>
              <span className="opacity-70">· {LOCALE_LABEL[t.locale]}</span>
              {!filled && !isActive && (
                <span
                  className="ml-1 h-1.5 w-1.5 rounded-full bg-vermilion"
                  title="Not translated yet"
                />
              )}
            </button>
          );
        })}
      </div>

      {/*
        Key on locale so React remounts the form with fresh defaultValues
        when the admin switches tabs — no stale input carrying over.
      */}
      <LocalePanel
        key={active}
        productId={productId}
        initial={current}
        enValues={enValues ?? null}
      />
    </div>
  );
}

// ──────── one locale's form ──────────────────────────────────────────────

function LocalePanel({
  productId,
  initial,
  enValues,
}: {
  productId: string;
  initial: TranslationData;
  enValues: TranslationData | null;
}) {
  const [state, formAction] = useActionState(
    updateTranslation.bind(null, productId),
    INITIAL_STATE,
  );

  // Refs to each translatable input — used by the auto-translate button
  // to write DeepL output straight into the DOM. We deliberately keep
  // `defaultValue` (uncontrolled inputs) for everything else; controlled
  // state across 8 fields would just add re-render churn for no benefit.
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  function setInput(name: string, value: string) {
    setNativeInputValue(inputRefs.current[name], value);
  }

  function applyTranslations(translations: Record<string, string>) {
    for (const [name, value] of Object.entries(translations)) {
      setInput(name, value);
    }
  }

  // Auto-translate button gets the SAVED English values. If Sofia just
  // typed into the EN tab without saving, those edits are NOT here yet
  // — the helper text below the button tells her to save EN first.
  function getEnSource(): Record<string, string> {
    if (!enValues) return {};
    return {
      name: enValues.name,
      shortDescription: enValues.shortDescription,
      description: enValues.description,
      howToUse: enValues.howToUse,
      warnings: enValues.warnings,
      seoTitle: enValues.seoTitle,
      seoDescription: enValues.seoDescription,
    };
  }

  // Current values keyed by field name — used by the button to decide
  // which fields are "empty" for the blanks-only mode.
  function getCurrentValues(): Record<string, string> {
    return {
      name: initial.name,
      shortDescription: initial.shortDescription,
      description: initial.description,
      howToUse: initial.howToUse,
      warnings: initial.warnings,
      seoTitle: initial.seoTitle,
      seoDescription: initial.seoDescription,
    };
  }

  const showTranslateButton = initial.locale !== Locale.EN;

  return (
    <form action={formAction} className="space-y-8">
      {/* locale is a hidden field so the server knows which row to upsert */}
      <input type="hidden" name="locale" value={initial.locale} />

      {/* ── AI helpers row ────────────────────────────────────────
          Two complementary tools, side-by-side:
          1. Auto-translate (DeepL): non-EN only. Fills empty fields
             with literal translations of the EN copy. Already wired.
          2. Polish with AI (Groq): every locale. Improves grammar,
             matches Asian Beauty Shop voice, fixes awkward translation phrasing.
             Diff modal so Sofia approves field-by-field.
          Polish doesn't touch slug, warnings, or SEO fields. */}
      <div className="flex flex-wrap items-start gap-3">
        {showTranslateButton && enValues && (
          <TranslateFromEnglishButton
            targetLocale={initial.locale}
            fields={TRANSLATABLE_FIELDS.map((f) => ({
              name: f.name,
              isHtml: f.isHtml,
              currentValue: getCurrentValues()[f.name] ?? "",
            }))}
            getSource={getEnSource}
            onTranslated={applyTranslations}
          />
        )}
        <AiPolishTranslationButton
          productId={productId}
          locale={initial.locale}
          onApply={(picked) => {
            // Inject only the fields Sofia ticked. Sofia clicks Save
            // translation below to commit.
            const asMap: Record<string, string> = {};
            for (const [key, value] of Object.entries(picked)) {
              if (typeof value === "string") asMap[key] = value;
            }
            applyTranslations(asMap);
          }}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Name"
          name="name"
          defaultValue={initial.name}
          required
          placeholder="e.g. Centella Calming Essence"
          errors={state.fieldErrors?.name}
          inputRef={(el) => {
            inputRefs.current.name = el;
          }}
        />
        <Field
          label="Slug"
          name="slug"
          defaultValue={initial.slug}
          required
          placeholder="centella-calming-essence"
          hint="Used in the URL. Lowercase, hyphens only."
          errors={state.fieldErrors?.slug}
        />
      </div>

      <TextAreaField
        label="Short description"
        name="shortDescription"
        rows={2}
        defaultValue={initial.shortDescription}
        hint="One or two lines shown on the product card and above the long description."
        inputRef={(el) => {
          inputRefs.current.shortDescription = el;
        }}
      />

      <TextAreaField
        label="Long description"
        name="description"
        rows={8}
        defaultValue={initial.description}
        required
        hint="HTML is supported (<p>, <strong>, <ul>…). A rich-text editor is coming — this is the same field."
        errors={state.fieldErrors?.description}
        inputRef={(el) => {
          inputRefs.current.description = el;
        }}
      />

      <TextAreaField
        label="How to use"
        name="howToUse"
        rows={5}
        defaultValue={initial.howToUse}
        hint="Ritual steps. Leave blank if not applicable."
        inputRef={(el) => {
          inputRefs.current.howToUse = el;
        }}
      />

      <TextAreaField
        label="Warnings &amp; cautions"
        name="warnings"
        rows={4}
        defaultValue={initial.warnings}
        hint="Safety / regulatory copy from the supplier (e.g. 'Avoid contact with eyes', 'Keep out of reach of children'). Shows as a small disclosure block at the bottom of the product page."
        inputRef={(el) => {
          inputRefs.current.warnings = el;
        }}
      />

      <div className="border-t border-ink/10 pt-6">
        <h3 className="font-display text-[16px] text-ink">SEO</h3>
        <p className="mt-1 text-[12px] text-ink-mid">
          Shown on Google and when the product is shared on social. Leave blank
          to use the product name.
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <Field
            label="SEO title"
            name="seoTitle"
            defaultValue={initial.seoTitle}
            placeholder="e.g. Centella Calming Essence · Asian Beauty Shop"
            inputRef={(el) => {
              inputRefs.current.seoTitle = el;
            }}
          />
          <Field
            label="SEO description"
            name="seoDescription"
            defaultValue={initial.seoDescription}
            placeholder="Short meta description for Google."
            inputRef={(el) => {
              inputRefs.current.seoDescription = el;
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-6 border-t border-ink/10 pt-6">
        <SubmitButton />
        <StatusMessage state={state} />
      </div>
    </form>
  );
}

// ──────── atoms (local to this form) ─────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] uppercase tracking-label text-ink-mid">
      {children}
    </label>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  placeholder,
  hint,
  errors,
  inputRef,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  errors?: string[];
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        ref={inputRef}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        className={cn(
          "mt-1 w-full border bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:outline-none",
          errors?.length
            ? "border-vermilion focus:border-vermilion"
            : "border-ink/15 focus:border-ink",
        )}
      />
      {hint && !errors?.length && (
        <p className="mt-1 text-[11px] text-ink-mid">{hint}</p>
      )}
      {errors?.length ? (
        <p className="mt-1 text-[11px] text-vermilion">{errors[0]}</p>
      ) : null}
    </div>
  );
}

function TextAreaField({
  label,
  name,
  rows,
  defaultValue,
  required,
  hint,
  errors,
  inputRef,
}: {
  label: string;
  name: string;
  rows: number;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
  errors?: string[];
  inputRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
        ref={inputRef}
        name={name}
        defaultValue={defaultValue}
        required={required}
        rows={rows}
        className={cn(
          "mt-1 w-full border bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:outline-none",
          errors?.length
            ? "border-vermilion focus:border-vermilion"
            : "border-ink/15 focus:border-ink",
        )}
      />
      {hint && !errors?.length && (
        <p className="mt-1 text-[11px] text-ink-mid">{hint}</p>
      )}
      {errors?.length ? (
        <p className="mt-1 text-[11px] text-vermilion">{errors[0]}</p>
      ) : null}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save translation"}
    </button>
  );
}

function StatusMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={cn(
        "text-[12px]",
        state.ok ? "text-gold" : "text-vermilion",
      )}
    >
      {state.message}
    </p>
  );
}
