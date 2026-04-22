"use client";

// ─────────────────────────────────────────────────────────────────────────
// SectionCopyForm — edits every field × 4 locales for one SiteCopy section.
//
// UX:
//   • One card per field
//   • Four inputs per card, stacked (EN, NL, FR, RU)
//   • Each input shows the JSON fallback as its placeholder so Sofia can
//     see what will render if she leaves the box blank
//   • Long fields (lede, body) get a textarea, short fields get an input
//
// Submits one FormData with every (field.locale) key → saveSectionAction.
// Empty value on any pair deletes that row (reverts to JSON default).
// ─────────────────────────────────────────────────────────────────────────

import { useActionState } from "react";
import { Locale } from "@prisma/client";
import {
  saveSectionAction,
  type ActionState,
} from "@/app/admin/homepage/actions";
import {
  Field,
  SaveBar,
  StatusBanner,
} from "@/components/admin/settings/settings-chrome";

const INITIAL_STATE: ActionState = { ok: false };

// Fields that get a textarea instead of an input. Everything else is a
// single-line input — eyebrows, titles, CTA labels, etc. shouldn't wrap.
const LONG_FIELDS = new Set(["lede", "body", "title_post", "title"]);

// Max lengths by field kind — gentle nudges, not hard caps on the DB.
const MAX_LENGTH: Record<string, number> = {
  eyebrow: 60,
  title: 180,
  title_pre: 40,
  title_kr: 8,
  title_post: 80,
  lede: 400,
  body: 500,
  cta_primary: 40,
  cta_secondary: 40,
  cta: 40,
  read_all: 30,
  placeholder: 40,
  tagline: 120,
  rights: 120,
};

const LOCALE_LABEL: Record<Locale, string> = {
  EN: "English",
  NL: "Dutch",
  FR: "French",
  RU: "Russian",
};

type FieldBlock = {
  field: string;
  label: string;
  fallbackByLocale: Record<Locale, string>;
  valueByLocale: Record<Locale, string>;
};

export function SectionCopyForm({
  section,
  fields,
  locales,
}: {
  section: string;
  fields: FieldBlock[];
  locales: Locale[];
}) {
  const [state, dispatch] = useActionState(saveSectionAction, INITIAL_STATE);

  return (
    <form action={dispatch} className="space-y-8">
      <input type="hidden" name="section" value={section} />

      {fields.map((fb) => {
        const isLong = LONG_FIELDS.has(fb.field);
        const max = MAX_LENGTH[fb.field];

        return (
          <fieldset
            key={fb.field}
            className="border border-ink/10 bg-white/60 p-6"
          >
            <legend className="px-1 font-display text-[18px] text-ink">
              {fb.label}
            </legend>
            <p className="-mt-1 mb-4 font-mono text-[10px] uppercase tracking-label text-ink-mid">
              {fb.field}
            </p>

            <div className="space-y-4">
              {locales.map((locale) => {
                const value = fb.valueByLocale[locale] ?? "";
                const fallback = fb.fallbackByLocale[locale] ?? "";
                const name = `${fb.field}.${locale}`;
                return (
                  <Field
                    key={locale}
                    label={LOCALE_LABEL[locale]}
                    hint={
                      fallback
                        ? `Default: ${truncate(fallback, 140)}`
                        : "No default — this field is blank unless you fill it in."
                    }
                  >
                    {isLong ? (
                      <textarea
                        name={name}
                        defaultValue={value}
                        placeholder={fallback}
                        rows={3}
                        maxLength={max}
                        className="input leading-relaxed"
                      />
                    ) : (
                      <input
                        name={name}
                        defaultValue={value}
                        placeholder={fallback}
                        maxLength={max}
                        className="input"
                      />
                    )}
                  </Field>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
