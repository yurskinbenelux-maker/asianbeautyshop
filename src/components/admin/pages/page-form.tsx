"use client";

// ─────────────────────────────────────────────────────────────────────────
// PageForm — shared create/edit form for static pages.
//
// The "key" field is only editable in create mode; changing it afterwards
// would break every link to the page, so we lock it after save.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useState } from "react";
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
import { cn } from "@/lib/utils";

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

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
                  name={`translations.${l}.body`}
                  defaultValue={t.body}
                  rows={16}
                  className="input font-mono text-[12px] leading-relaxed"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="SEO title" hint="Shown in browser tabs and search results.">
                  <input
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
