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
//   • A "Hide on the site" checkbox per field. Tick it → the public site
//     renders nothing for that field across all 4 languages, no fallback
//     to the JSON catalogue. Locale inputs go disabled while ticked
//     because they're moot: the field is hidden anywhere it'd render.
//
// Submits one FormData with every (field.locale) key → saveSectionAction.
// Empty value on any pair deletes that row (reverts to JSON default).
// `${field}.__void` carries the hide state.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useRef, useState, useTransition } from "react";
import { EyeOff, Sparkles } from "lucide-react";
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
import { translateFieldsAction } from "@/app/admin/translate/actions";
import { cn } from "@/lib/utils";

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
  voided: boolean;
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

      {fields.map((fb) => (
        <FieldFieldset
          key={fb.field}
          fb={fb}
          locales={locales}
        />
      ))}

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// FieldFieldset — one field's worth of inputs (4 locales) + the
// "Hide on the site" toggle. Pulled out into its own component because
// it needs local state for the toggle, and we don't want to bloat the
// parent's render with N useState calls.
// ─────────────────────────────────────────────────────────────────────────

function FieldFieldset({
  fb,
  locales,
}: {
  fb: FieldBlock;
  locales: Locale[];
}) {
  const [voided, setVoided] = useState(fb.voided);
  const isLong = LONG_FIELDS.has(fb.field);
  const max = MAX_LENGTH[fb.field];

  // Refs to each locale's input — used by the per-field "Translate from
  // English" button to read EN and write into NL / FR / RU. The homepage
  // editor stacks all 4 locales per field, so a single click translating
  // all three target languages at once is the natural UX (versus the
  // tabbed forms which translate one locale at a time).
  const inputRefs = useRef<
    Record<string, HTMLInputElement | HTMLTextAreaElement | null>
  >({});

  return (
    <fieldset
      className={
        "border bg-white/60 p-6 " +
        (voided
          ? "border-vermilion/40 bg-vermilion/[0.03]"
          : "border-ink/10")
      }
    >
      <legend className="px-1 font-display text-[18px] text-ink">
        {fb.label}
      </legend>
      <p className="-mt-1 mb-4 font-mono text-[10px] uppercase tracking-label text-ink-mid">
        {fb.field}
      </p>

      {/* Hide-on-site toggle. Sends `${field}.__void` = "yes" | "no" so
          the server action knows whether to write the sentinel to all
          four locales (yes) or fall through to the per-locale inputs
          below (no). */}
      <label className="mb-4 flex cursor-pointer items-start gap-3 border border-ink/10 bg-rice-dim/50 p-3">
        <input
          type="checkbox"
          name={`${fb.field}.__void`}
          value="yes"
          checked={voided}
          onChange={(e) => setVoided(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-vermilion"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
            <EyeOff className="h-3.5 w-3.5" />
            Hide this field on the site
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-mid">
            Renders nothing in any language. Toggling this overrides the
            text inputs below in all four languages until you uncheck it.
          </p>
        </div>
      </label>

      <div
        className={
          "space-y-4 " + (voided ? "pointer-events-none opacity-50" : "")
        }
        aria-hidden={voided}
      >
        {/* Translate from EN button — sits above the locale stack, fills
            NL / FR / RU at once. Field-level (not section-level) so Sofia
            can translate one card without touching others. */}
        {!voided && (
          <TranslateAllNonEnButton
            fieldName={fb.field}
            getEnValue={() => inputRefs.current[Locale.EN]?.value ?? ""}
            setLocaleValue={(locale, value) => {
              const el = inputRefs.current[locale];
              if (el) el.value = value;
            }}
            getCurrentValueForLocale={(locale) =>
              inputRefs.current[locale]?.value ??
              fb.valueByLocale[locale] ??
              ""
            }
          />
        )}

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
                  ref={(el) => {
                    inputRefs.current[locale] = el;
                  }}
                  name={name}
                  defaultValue={value}
                  placeholder={fallback}
                  rows={3}
                  maxLength={max}
                  disabled={voided}
                  className="input leading-relaxed"
                />
              ) : (
                <input
                  ref={(el) => {
                    inputRefs.current[locale] = el;
                  }}
                  name={name}
                  defaultValue={value}
                  placeholder={fallback}
                  maxLength={max}
                  disabled={voided}
                  className="input"
                />
              )}
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TranslateAllNonEnButton — fan-out variant. Calls the translate action
// once per target locale (NL, FR, RU) in parallel. This is the only place
// in the codebase where one click fills three locales at once — it fits
// the per-field-card layout where all 4 locales are visible together.
// ─────────────────────────────────────────────────────────────────────────

const TARGET_LOCALES: Locale[] = [Locale.NL, Locale.FR, Locale.RU];
const LOCALE_SHORT: Record<Locale, string> = {
  EN: "EN",
  NL: "NL",
  FR: "FR",
  RU: "RU",
};

function TranslateAllNonEnButton({
  fieldName,
  getEnValue,
  setLocaleValue,
  getCurrentValueForLocale,
}: {
  fieldName: string;
  getEnValue: () => string;
  setLocaleValue: (locale: Locale, value: string) => void;
  getCurrentValueForLocale: (locale: Locale) => string;
}) {
  const [pending, startTransition] = useTransition();
  const [overwrite, setOverwrite] = useState(false);
  const [message, setMessage] = useState<
    | { kind: "ok"; text: string }
    | { kind: "error"; text: string }
    | null
  >(null);

  function run() {
    setMessage(null);
    const enValue = getEnValue().trim();
    if (enValue.length === 0) {
      setMessage({
        kind: "ok",
        text: "Fill in the English value first, then translate.",
      });
      return;
    }

    // Decide which target locales to actually hit. Skip ones already
    // filled unless overwrite is on.
    const targets = TARGET_LOCALES.filter((l) => {
      if (overwrite) return true;
      return getCurrentValueForLocale(l).trim().length === 0;
    });

    if (targets.length === 0) {
      setMessage({
        kind: "ok",
        text: "Already translated. Tick 'Overwrite' to redo.",
      });
      return;
    }

    startTransition(async () => {
      try {
        // Three parallel calls — one per locale. Could batch into one
        // call by extending the action to accept a multi-locale shape,
        // but in practice 3 parallel HTTP calls to DeepL complete in
        // ~1s and the action signature stays simple this way.
        const results = await Promise.all(
          targets.map((locale) =>
            translateFieldsAction({
              fields: {
                [fieldName]: { value: enValue, isHtml: false },
              },
              targetLocale: locale,
            }).then((r) => ({ locale, result: r })),
          ),
        );

        const errors: string[] = [];
        for (const { locale, result } of results) {
          if (!result.ok) {
            errors.push(`${LOCALE_SHORT[locale]}: ${result.message}`);
            continue;
          }
          const translated = result.translations[fieldName];
          if (typeof translated === "string") {
            setLocaleValue(locale, translated);
          }
        }
        if (errors.length > 0) {
          setMessage({ kind: "error", text: errors.join(" · ") });
        } else {
          setMessage({
            kind: "ok",
            text: `Translated to ${targets.map((l) => LOCALE_SHORT[l]).join(", ")}. Review before saving.`,
          });
        }
      } catch (err) {
        setMessage({
          kind: "error",
          text:
            err instanceof Error
              ? err.message
              : "Something went wrong calling the translator.",
        });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border border-dashed border-ink/20 bg-rice/30 px-3 py-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1.5 border border-ink bg-white px-3 py-1 text-[10.5px] uppercase tracking-label text-ink transition-colors",
          pending ? "opacity-60" : "hover:bg-ink hover:text-rice",
        )}
      >
        <Sparkles className="h-3 w-3" aria-hidden />
        {pending ? "Translating…" : "Translate EN → NL · FR · RU"}
      </button>
      <label className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-mid">
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(e) => setOverwrite(e.target.checked)}
          className="h-3 w-3 accent-vermilion"
        />
        Overwrite
      </label>
      {message && (
        <span
          className={cn(
            "text-[10.5px]",
            message.kind === "error" ? "text-vermilion" : "text-ink-mid",
          )}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
