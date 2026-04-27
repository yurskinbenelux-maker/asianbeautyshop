// ─────────────────────────────────────────────────────────────────────────
// TranslationsForm — one panel per locale (EN · NL · FR · RU).
//
// Each locale is its own <form> posting to updateTranslation. That means
// Sofia can save EN without having filled in RU yet, errors in one locale
// don't roll back the others, and the diff stays small.
//
// Rich text: for now we ship plain <textarea> so the whole editor works
// today. Tiptap (WYSIWYG) will swap in later behind this same contract
// — the stored value is HTML either way.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Locale } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  updateTranslation,
  type ActionState,
} from "@/app/admin/products/actions";

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
      />
    </div>
  );
}

// ──────── one locale's form ──────────────────────────────────────────────

function LocalePanel({
  productId,
  initial,
}: {
  productId: string;
  initial: TranslationData;
}) {
  const [state, formAction] = useActionState(
    updateTranslation.bind(null, productId),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-8">
      {/* locale is a hidden field so the server knows which row to upsert */}
      <input type="hidden" name="locale" value={initial.locale} />

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Name"
          name="name"
          defaultValue={initial.name}
          required
          placeholder="e.g. Centella Calming Essence"
          errors={state.fieldErrors?.name}
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
      />

      <TextAreaField
        label="Long description"
        name="description"
        rows={8}
        defaultValue={initial.description}
        required
        hint="HTML is supported (<p>, <strong>, <ul>…). A rich-text editor is coming — this is the same field."
        errors={state.fieldErrors?.description}
      />

      <TextAreaField
        label="How to use"
        name="howToUse"
        rows={5}
        defaultValue={initial.howToUse}
        hint="Ritual steps. Leave blank if not applicable."
      />

      <TextAreaField
        label="Warnings &amp; cautions"
        name="warnings"
        rows={4}
        defaultValue={initial.warnings}
        hint="Safety / regulatory copy from the supplier (e.g. 'Avoid contact with eyes', 'Keep out of reach of children'). Shows as a small disclosure block at the bottom of the product page."
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
            placeholder="e.g. Centella Calming Essence · YU.R"
          />
          <Field
            label="SEO description"
            name="seoDescription"
            defaultValue={initial.seoDescription}
            placeholder="Short meta description for Google."
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
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  errors?: string[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
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
}: {
  label: string;
  name: string;
  rows: number;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
  errors?: string[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <textarea
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
