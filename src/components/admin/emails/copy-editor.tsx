"use client";

// ─────────────────────────────────────────────────────────────────────────
// EmailCopyEditor — full per-locale copy editor for one email template.
//
// Layout:
//   ┌─ Locale tabs (EN · NL · FR · RU) ──────┐ ┌─ Live preview iframe ─┐
//   │ ┌─ Warning banner ─────────────────┐   │ │                       │
//   │ ┌─ Field card ────────────────────┐│   │ │   Email rendered      │
//   │ │ Label · badges                  ││   │ │   with current draft  │
//   │ │ [textarea]                      ││   │ │   overrides applied,  │
//   │ │ [Save] [Reset] [DeepL] [Polish] ││   │ │   debounced 400ms.    │
//   │ └─────────────────────────────────┘│   │ │                       │
//   │ ... one card per field             │   │ │ (sticky on lg+)       │
//   └────────────────────────────────────┘   │ └───────────────────────┘
//
// Live preview: every text change kicks off a debounced `previewEmailAction`
// call — the iframe srcDoc updates in ~400ms without leaving the page.
//
// Polish button is always visible (when not dynamic). If the field is
// empty, polish runs against the default text and saves the result as
// the override — Sofia gets variants of the built-in copy without
// having to type a starting point.
//
// Dynamic fields (subject, heading) render read-only with an orange
// "Contains dynamic placeholders" warning.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Languages,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { Locale } from "@prisma/client";

import { cn } from "@/lib/utils";
import type {
  EmailFieldDescriptor,
  DefaultStringsByLocale,
} from "@/app/admin/emails/field-meta";
import {
  saveEmailOverrideAction,
  resetEmailOverrideAction,
  translateEmailFieldAction,
  polishEmailFieldAction,
  previewEmailAction,
} from "@/app/admin/emails/actions";

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

type OverrideMap = Record<Locale, Record<string, string>>;

export function EmailCopyEditor({
  emailKey,
  fieldMeta,
  defaults,
  initialOverrides,
}: {
  emailKey: string;
  templateLabel: string;
  fieldMeta: EmailFieldDescriptor[];
  defaults: DefaultStringsByLocale;
  initialOverrides: OverrideMap;
}) {
  const [activeLocale, setActiveLocale] = useState<Locale>(Locale.EN);
  const [overrides, setOverrides] = useState<OverrideMap>(initialOverrides);

  // Live preview state.
  //
  // `previewVersion` increments on every successful refresh. We pass it
  // as the iframe's React `key` so the element remounts on each update —
  // some browsers don't reliably re-paint iframe content when only
  // `srcDoc` changes on the same DOM node (the existing read-only
  // preview page got away with it because srcDoc was set ONCE during
  // server render; here we update it client-side as Sofia types).
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewVersion, setPreviewVersion] = useState<number>(0);
  const previewDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPreview = useCallback(
    (nextOverrides: OverrideMap, locale: Locale, immediate: boolean) => {
      if (previewDebounce.current) clearTimeout(previewDebounce.current);
      const run = async () => {
        setPreviewLoading(true);
        try {
          const result = await previewEmailAction({
            emailKey,
            locale,
            overrides: nextOverrides[locale] ?? {},
          });
          if (result.ok) {
            setPreviewHtml(result.html);
            setPreviewSubject(result.subject);
            setPreviewVersion((v) => v + 1);
          } else {
            // Server-side render returned ok:false — usually a fixture
            // / template mismatch. Surface it so the user knows
            // something's off rather than silently leaving the iframe
            // blank.
            console.warn("[email-editor] preview returned ok:false");
          }
        } catch (err) {
          console.error("[email-editor] preview failed", err);
        } finally {
          setPreviewLoading(false);
        }
      };
      if (immediate) {
        // First paint — fetch right away so the iframe doesn't sit
        // blank for 400ms on page load.
        void run();
      } else {
        previewDebounce.current = setTimeout(run, 400);
      }
    },
    [emailKey],
  );

  // First mount → fetch immediately. Locale switch + text changes →
  // debounced. We split the two paths via a ref so we know whether
  // it's the first effect run or a subsequent one.
  const didInitialFetch = useRef(false);
  useEffect(() => {
    refreshPreview(overrides, activeLocale, !didInitialFetch.current);
    didInitialFetch.current = true;
    return () => {
      if (previewDebounce.current) clearTimeout(previewDebounce.current);
    };
  }, [refreshPreview, overrides, activeLocale]);

  const updateField = (locale: Locale, fieldKey: string, value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [locale]: { ...prev[locale], [fieldKey]: value },
    }));
  };

  // Bulk-apply translation results across NL/FR/RU at once. Called by
  // FieldCard after a successful DeepL translate so the other-locale
  // tabs immediately show the new copy without a page reload (the
  // server action already wrote the rows to the DB).
  const applyTranslations = (
    fieldKey: string,
    translations: Partial<Record<Locale, string>>,
  ) => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const [loc, value] of Object.entries(translations) as Array<
        [Locale, string]
      >) {
        if (!value) continue;
        next[loc] = { ...prev[loc], [fieldKey]: value };
      }
      return next;
    });
  };

  return (
    <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* ── Left column: editor ───────────────────────────────────── */}
      <div className="min-w-0">
        {/* Warning banner about dynamic fields */}
        <div className="mb-6 flex items-start gap-3 border border-gold/40 bg-gold/5 px-4 py-3">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold"
            aria-hidden
          />
          <div className="text-[13px] leading-relaxed text-ink">
            <strong className="font-medium">Heads up — dynamic fields.</strong>{" "}
            Some fields below are marked{" "}
            <span className="inline-flex items-center bg-gold/15 px-1.5 py-0.5 text-[10px] uppercase tracking-label text-gold">
              Dynamic
            </span>{" "}
            because they contain placeholders that get filled at send
            time (the customer&apos;s order number, first name, etc.).
            Those fields are read-only here. Editing them would
            compromise the email — to change a dynamic field, ask your
            developer to update the email&apos;s TS file directly.
          </div>
        </div>

        {/* Locale tabs */}
        <div
          role="tablist"
          aria-label="Locale"
          className="mb-6 flex flex-wrap items-center gap-1 border-b border-ink/10"
        >
          {LOCALES.map((loc) => {
            const isActive = activeLocale === loc;
            const overrideCount = Object.values(overrides[loc] ?? {}).filter(
              (v) => v && v.trim().length > 0,
            ).length;
            return (
              <button
                key={loc}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveLocale(loc)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2 text-[12px] uppercase tracking-label transition-colors",
                  isActive
                    ? "border-b-2 border-ink text-ink"
                    : "border-b-2 border-transparent text-ink-mid hover:text-ink",
                )}
              >
                {loc}
                {overrideCount > 0 && (
                  <span
                    className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-vermilion px-1 text-[10px] font-medium text-rice"
                    title={`${overrideCount} override${overrideCount === 1 ? "" : "s"}`}
                  >
                    {overrideCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Fields */}
        <div className="space-y-5">
          {fieldMeta.map((field) => (
            <FieldCard
              key={field.key}
              emailKey={emailKey}
              field={field}
              locale={activeLocale}
              defaultValue={defaults[activeLocale]?.[field.key] ?? ""}
              value={overrides[activeLocale]?.[field.key] ?? ""}
              onChange={(v) => updateField(activeLocale, field.key, v)}
              onApplyTranslations={(translations) =>
                applyTranslations(field.key, translations)
              }
            />
          ))}
        </div>

        <p className="mt-10 text-[12px] leading-relaxed text-ink-mid">
          Tip — edit the <span className="font-medium text-ink">EN</span>{" "}
          tab first, then hit{" "}
          <span className="inline-flex items-center gap-1">
            <Languages className="h-3 w-3 text-vermilion" /> Translate to
            NL/FR/RU
          </span>{" "}
          on each field. DeepL handles the heavy lifting; you can still
          hand-tweak after.
        </p>
      </div>

      {/* ── Right column: live preview iframe ─────────────────────── */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="border border-ink/10 bg-white">
          {/* Preview header — locale + subject + loading dot */}
          <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-label text-ink-mid">
                Live preview · {activeLocale}
              </div>
              <div className="mt-0.5 truncate font-mono text-[12px] text-ink">
                {previewSubject || "—"}
              </div>
            </div>
            {previewLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-mid" />
            )}
          </div>
          {/* Iframe — sandboxed so the email's inline styles can't
              leak into the admin chrome. The `key` forces a remount
              every time the rendered HTML changes, working around a
              React quirk where setting srcDoc on the same iframe
              element doesn't always re-paint the content. */}
          {previewHtml ? (
            <iframe
              key={previewVersion}
              title="Email live preview"
              srcDoc={previewHtml}
              sandbox=""
              className="block h-[760px] w-full bg-white"
            />
          ) : (
            <div className="flex h-[760px] w-full items-center justify-center bg-rice-dim/40 text-[12px] text-ink-mid">
              {previewLoading ? "Rendering preview…" : "No preview yet."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Single field card — textarea + 4 action buttons.
// ─────────────────────────────────────────────────────────────────────────

function FieldCard({
  emailKey,
  field,
  locale,
  defaultValue,
  value,
  onChange,
  onApplyTranslations,
}: {
  emailKey: string;
  field: EmailFieldDescriptor;
  locale: Locale;
  defaultValue: string;
  value: string;
  onChange: (v: string) => void;
  /** Called after successful DeepL translate with the values that were
   *  saved as overrides for the OTHER locales. The parent merges them
   *  into shared state so switching tabs shows the new copy. */
  onApplyTranslations: (
    translations: Partial<Record<Locale, string>>,
  ) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<
    null | "save" | "reset" | "translate" | "polish"
  >(null);

  const isDynamic = field.kind === "dynamic";
  const hasOverride = value.trim().length > 0;
  // For polish: use override text if any, otherwise the default text.
  // The button is always visible (when not dynamic) so Sofia can
  // generate variants from the default copy without typing first.
  const polishSourceText = value.trim().length > 0 ? value : defaultValue;

  // Generic action runner. Returns the action result via the
  // onSuccess callback so callers can merge action-specific data
  // (translations, polished text) into local state — without that
  // hook the textareas / locale tabs would still show the pre-action
  // values until a full reload, which is exactly the bug Sofia hit.
  const run = async <T extends { ok: boolean; message?: string }>(
    kind: "save" | "reset" | "translate" | "polish",
    formData: FormData,
    fn: (
      _prev: { ok: boolean; message?: string },
      fd: FormData,
    ) => Promise<T>,
    onSuccess?: (result: T) => void,
  ) => {
    setBusyKind(kind);
    setError(null);
    startTransition(async () => {
      const result = await fn({ ok: false }, formData);
      if (result.ok) {
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
        onSuccess?.(result);
      } else {
        setError(result.message ?? "Something went wrong.");
      }
      setBusyKind(null);
    });
  };

  return (
    <div
      className={cn(
        "border bg-white/60 p-5",
        isDynamic ? "border-gold/30 bg-gold/5" : "border-ink/10",
      )}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium uppercase tracking-label text-ink">
            {field.label}
          </span>
          {isDynamic && (
            <span className="inline-flex items-center gap-1 bg-gold/20 px-1.5 py-0.5 text-[10px] uppercase tracking-label text-gold">
              <AlertTriangle className="h-3 w-3" />
              Dynamic
            </span>
          )}
          {!isDynamic && hasOverride && (
            <span className="inline-flex items-center gap-1 border border-vermilion/30 bg-vermilion/5 px-1.5 py-0.5 text-[10px] uppercase tracking-label text-vermilion">
              Custom
            </span>
          )}
        </div>
        {savedAt && (
          <span className="inline-flex items-center gap-1 text-[11px] text-sage">
            <Check className="h-3 w-3" />
            Saved
          </span>
        )}
      </div>

      {/* Default text (always shown for dynamic; placeholder otherwise) */}
      {isDynamic ? (
        <pre className="mt-3 whitespace-pre-wrap break-words border border-gold/20 bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-mid">
          {defaultValue || "(no default available — managed in code)"}
        </pre>
      ) : (
        <>
          {field.kind === "long" ? (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={defaultValue}
              rows={4}
              className="mt-3 w-full resize-y border border-ink/15 bg-white px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={defaultValue}
              className="mt-3 w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
            />
          )}
          <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-ink-mid">
            <span>
              {field.hint ?? "Empty textarea = use the built-in default."}
            </span>
            {!hasOverride && defaultValue && (
              <span className="italic">Showing default as placeholder.</span>
            )}
          </div>
        </>
      )}

      {/* Action row */}
      {!isDynamic && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Save — only if there's a value to save */}
          {value.trim() && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("emailKey", emailKey);
                fd.set("locale", locale);
                fd.set("fieldKey", field.key);
                fd.set("value", value);
                run("save", fd, saveEmailOverrideAction);
              }}
              className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-[11px] uppercase tracking-label text-rice transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busyKind === "save" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save
            </button>
          )}

          {/* Reset — only if there's a saved override */}
          {hasOverride && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("emailKey", emailKey);
                fd.set("locale", locale);
                fd.set("fieldKey", field.key);
                run("reset", fd, resetEmailOverrideAction);
                onChange("");
              }}
              className="inline-flex items-center gap-1.5 border border-ink/15 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
            >
              {busyKind === "reset" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              Reset
            </button>
          )}

          {/* DeepL — EN tab only, requires a value to push */}
          {locale === Locale.EN && value.trim() && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("emailKey", emailKey);
                fd.set("fieldKey", field.key);
                fd.set("value", value);
                run("translate", fd, translateEmailFieldAction, (result) => {
                  // Merge DeepL output into shared state so the
                  // NL/FR/RU tabs immediately show the new copy.
                  // Without this the DB row exists but the client's
                  // useState still holds the empty initial value.
                  if (result.translations) {
                    onApplyTranslations(result.translations);
                  }
                });
              }}
              className="inline-flex items-center gap-1.5 border border-vermilion/30 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-vermilion transition-colors hover:bg-vermilion/5 disabled:opacity-50"
              title="Auto-translate this value into NL, FR, RU and save each as an override"
            >
              {busyKind === "translate" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Languages className="h-3 w-3" />
              )}
              Translate to NL/FR/RU
            </button>
          )}

          {/* Groq polish — always visible (when not dynamic). Acts on
              custom text if present, otherwise on the default copy. */}
          {polishSourceText.trim() && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("emailKey", emailKey);
                fd.set("locale", locale);
                fd.set("fieldKey", field.key);
                fd.set("value", polishSourceText);
                run("polish", fd, polishEmailFieldAction, (result) => {
                  // Drop the polished text straight into the textarea
                  // so Sofia sees the variant without flipping pages.
                  // The action already saved it to the DB.
                  if (result.polishedValue) {
                    onChange(result.polishedValue);
                  }
                });
              }}
              className="inline-flex items-center gap-1.5 border border-ink/15 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink transition-colors hover:border-vermilion hover:text-vermilion disabled:opacity-50"
              title={
                hasOverride
                  ? "Polish your custom text with AI"
                  : "Suggest a variant of the default copy"
              }
            >
              {busyKind === "polish" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {hasOverride ? "Polish my text" : "Suggest variant"}
            </button>
          )}

          {error && (
            <span className="ml-2 text-[11px] text-vermilion">{error}</span>
          )}
        </div>
      )}
    </div>
  );
}
