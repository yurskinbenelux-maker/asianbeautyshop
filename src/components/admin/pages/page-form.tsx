"use client";

// ─────────────────────────────────────────────────────────────────────────
// PageForm — shared create/edit form for static pages.
//
// The "key" field is only editable in create mode; changing it afterwards
// would break every link to the page, so we lock it after save.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useRef, useState } from "react";
import {
  createPageAction,
  updatePageAction,
  type ActionState,
} from "@/app/admin/pages/actions";
import { Locale } from "@prisma/client";
import {
  Field,
  SaveBar,
  StatusBanner,
} from "@/components/admin/settings/settings-chrome";
import { TranslateFromEnglishButton } from "@/components/admin/translate-button";
import { setNativeInputValue } from "@/lib/admin/native-input";
import { cn } from "@/lib/utils";

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

/** Fields fed through DeepL. Body carries HTML so it gets the
 *  tag_handling=html flag on the DeepL side. */
const TRANSLATABLE_FIELDS: ReadonlyArray<{
  name: "title" | "body" | "seoTitle" | "seoDescription";
  isHtml: boolean;
}> = [
  { name: "title", isHtml: false },
  { name: "body", isHtml: true },
  { name: "seoTitle", isHtml: false },
  { name: "seoDescription", isHtml: false },
];

/** Page keys that contain legally-binding text. Auto-translation is
 *  permitted as a starting draft but the UI surfaces a warning so Sofia
 *  knows to have a native speaker review before publishing. */
const LEGAL_PAGE_KEYS = new Set([
  "privacy",
  "terms",
  "cookies",
  "returns",
  "imprint",
  "legal-notice",
  "refund-policy",
]);

const INITIAL_STATE: ActionState = { ok: false };

type Translation = {
  locale: Locale;
  title: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
};

export type PageFormInitial = {
  key?: string;
  isActive: boolean;
  translations: Record<Locale, Translation>;
};

const EMPTY_T = (locale: Locale): Translation => ({
  locale,
  title: "",
  body: "",
  seoTitle: "",
  seoDescription: "",
});

const EMPTY: PageFormInitial = {
  isActive: true,
  translations: {
    EN: EMPTY_T("EN"),
    NL: EMPTY_T("NL"),
    FR: EMPTY_T("FR"),
    RU: EMPTY_T("RU"),
  },
};

export function PageForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: PageFormInitial;
}) {
  const data = initial ?? EMPTY;
  const action = mode === "create" ? createPageAction : updatePageAction;
  const [state, dispatch] = useActionState(action, INITIAL_STATE);
  const err = state.fieldErrors ?? {};
  const [activeLocale, setActiveLocale] = useState<Locale>("EN");

  const isLegalPage = data.key ? LEGAL_PAGE_KEYS.has(data.key) : false;

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
    <form action={dispatch} className="max-w-3xl space-y-6">
      {mode === "edit" && data.key && (
        <input type="hidden" name="key" value={data.key} />
      )}

      <Field
        label="Page key"
        hint={
          mode === "create"
            ? "Used in the URL. Lowercase letters, numbers, and hyphens."
            : "Locked — changing this would break every link to the page."
        }
        error={err.key?.[0]}
      >
        <input
          name="key"
          defaultValue={data.key ?? ""}
          className="input font-mono tracking-label"
          placeholder="about"
          maxLength={40}
          readOnly={mode === "edit"}
          disabled={mode === "edit"}
        />
      </Field>

      <label className="flex items-start gap-2 text-[12px] text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={data.isActive}
          className="mt-0.5 h-3.5 w-3.5 accent-ink"
        />
        <span>
          <span>Published</span>
          <span className="mt-0.5 block text-[11px] text-ink-mid">
            When off, the public page 404s. Toggle off to take it down
            without deleting the content.
          </span>
        </span>
      </label>

      {/* per-locale copy */}
      <div className="space-y-3 border-t border-ink/10 pt-6">
        <div className="text-[11px] uppercase tracking-label text-ink-mid">
          Copy · by language
        </div>
        <div className="flex flex-wrap gap-1 border-b border-ink/10">
          {LOCALES.map((l) => {
            const on = activeLocale === l;
            const filled = data.translations[l]?.title.trim().length > 0;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setActiveLocale(l)}
                className={cn(
                  "border-b-2 px-3 py-1.5 text-[12px] uppercase tracking-label transition-colors",
                  on
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-mid hover:text-ink",
                )}
              >
                {l}
                {l === "EN" && <span className="ml-1 text-vermilion">*</span>}
                {l !== "EN" && !filled && (
                  <span
                    className="ml-1 inline-block h-1 w-1 rounded-full bg-ink-mid/40"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        {LOCALES.map((l) => {
          const t = data.translations[l];
          const on = activeLocale === l;
          return (
            <div
              key={l}
              className={on ? "space-y-3" : "hidden"}
              aria-hidden={!on}
            >
              {/* Auto-translate button on every non-EN tab.
                  Legal pages get an extra warning since auto-translated
                  legal text is a liability if not human-reviewed. */}
              {l !== "EN" && (
                <>
                  {isLegalPage && (
                    <p className="border border-vermilion/40 bg-vermilion/5 px-3 py-2 text-[11px] leading-relaxed text-vermilion">
                      <strong>Legal page:</strong> auto-translated text is a
                      starting draft only. Have a native speaker review the
                      output before saving — mistranslations of refund
                      windows, jurisdiction, or warranty terms can be held
                      against you.
                    </p>
                  )}
                  <TranslateFromEnglishButton
                    targetLocale={l}
                    fields={TRANSLATABLE_FIELDS.map((f) => ({
                      name: f.name,
                      isHtml: f.isHtml,
                      currentValue:
                        inputRefs.current[`${l}.${f.name}`]?.value ??
                        (t[f.name] ?? ""),
                    }))}
                    getSource={getEnSource}
                    onTranslated={(tr) => applyTranslations(l, tr)}
                  />
                </>
              )}

              <Field
                label={l === "EN" ? "Title (required)" : "Title"}
                hint={
                  l === "EN"
                    ? "The page headline."
                    : `${l} — falls back to EN if blank.`
                }
                error={err[`translations.${l}.title`]?.[0]}
              >
                <input
                  ref={(el) => {
                    inputRefs.current[`${l}.title`] = el;
                  }}
                  name={`translations.${l}.title`}
                  defaultValue={t.title}
                  className="input"
                  maxLength={200}
                />
              </Field>

              <Field
                label={l === "EN" ? "Body (required)" : "Body"}
                hint="HTML is supported. A WYSIWYG editor is coming — this is the same field."
                error={err[`translations.${l}.body`]?.[0]}
              >
                <textarea
                  ref={(el) => {
                    inputRefs.current[`${l}.body`] = el;
                  }}
                  name={`translations.${l}.body`}
                  defaultValue={t.body}
                  rows={16}
                  className="input font-mono text-[12px] leading-relaxed"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="SEO title" hint="Shown in browser tabs and search results.">
                  <input
                    ref={(el) => {
                      inputRefs.current[`${l}.seoTitle`] = el;
                    }}
                    name={`translations.${l}.seoTitle`}
                    defaultValue={t.seoTitle}
                    className="input"
                    maxLength={160}
                  />
                </Field>
                <Field
                  label="SEO description"
                  hint="Meta description — under 160 chars ideally."
                >
                  <input
                    ref={(el) => {
                      inputRefs.current[`${l}.seoDescription`] = el;
                    }}
                    name={`translations.${l}.seoDescription`}
                    defaultValue={t.seoDescription}
                    className="input"
                    maxLength={300}
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}
