"use client";

// ─────────────────────────────────────────────────────────────────────────
// EmailCopyEditor — full per-locale copy editor for one email template.
//
// Layout:
//   ┌─ Locale tabs (EN · NL · FR · RU) ──────────────────────────────┐
//   │ ┌─ Warning banner (always visible) ─────────────────────────┐  │
//   │ ┌─ Field card ─────────────────────────────────────────────┐  │
//   │ │ Label · current state badge                               │  │
//   │ │ [textarea, prefilled with override OR placeholder=default]│  │
//   │ │ [Save] [Reset] [DeepL→others (EN only)] [Groq polish]    │  │
//   │ └───────────────────────────────────────────────────────────┘  │
//   │ ... one card per field                                         │
//   └────────────────────────────────────────────────────────────────┘
//
// Dynamic fields (subject, heading) render read-only with an
// orange "Contains dynamic placeholders" warning. Sofia can see the
// default text but can't edit it.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
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
  /** Just for context if we ever want to show it in the warning. */
  templateLabel: string;
  fieldMeta: EmailFieldDescriptor[];
  defaults: DefaultStringsByLocale;
  initialOverrides: OverrideMap;
}) {
  const [activeLocale, setActiveLocale] = useState<Locale>(Locale.EN);
  // Editor's current "in flight" values per (locale, fieldKey). On
  // successful save these are committed; reset clears them back to
  // defaults; the page reloads fresh data from the server on revalidation.
  const [overrides, setOverrides] = useState<OverrideMap>(initialOverrides);

  const updateField = (locale: Locale, fieldKey: string, value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [locale]: { ...prev[locale], [fieldKey]: value },
    }));
  };

  return (
    <div className="mt-8">
      {/* ── Warning banner about dynamic fields ────────────────────── */}
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
          because they contain placeholders that get filled at send time
          (the customer&apos;s order number, first name, etc.). Those
          fields are read-only here. Editing them would compromise the
          email — to change a dynamic field, ask your developer to update
          the email&apos;s TS file directly.
        </div>
      </div>

      {/* ── Locale tabs ─────────────────────────────────────────────── */}
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
                  title={`${overrideCount} override${overrideCount === 1 ? "" : "s"} saved`}
                >
                  {overrideCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Fields ──────────────────────────────────────────────────── */}
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
          />
        ))}
      </div>

      <p className="mt-10 text-[12px] leading-relaxed text-ink-mid">
        Tip — edit the <span className="font-medium text-ink">EN</span> tab
        first, then hit the{" "}
        <span className="inline-flex items-center gap-1">
          <Languages className="h-3 w-3 text-vermilion" /> Translate to NL/FR/RU
        </span>{" "}
        button on each field. DeepL handles the heavy lifting; you can
        still hand-tweak the result.
      </p>
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
}: {
  emailKey: string;
  field: EmailFieldDescriptor;
  locale: Locale;
  defaultValue: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<
    null | "save" | "reset" | "translate" | "polish"
  >(null);

  const isDynamic = field.kind === "dynamic";
  const hasOverride = value.trim().length > 0;

  // Run any of our four server actions, threading FormData through.
  const run = async (
    kind: "save" | "reset" | "translate" | "polish",
    formData: FormData,
    fn: (
      _prev: { ok: boolean; message?: string },
      fd: FormData,
    ) => Promise<{ ok: boolean; message?: string }>,
  ) => {
    setBusyKind(kind);
    setError(null);
    startTransition(async () => {
      const result = await fn({ ok: false }, formData);
      if (result.ok) {
        setSavedAt(Date.now());
        // Hide the "Saved" indicator after 2.5s
        setTimeout(() => setSavedAt(null), 2500);
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
      {/* ── Header row ─────────────────────────────────────────────── */}
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

      {/* ── Default text (always shown for dynamic; placeholder otherwise) ── */}
      {isDynamic ? (
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-none border border-gold/20 bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-mid">
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
          <div className="mt-1 flex items-center justify-between text-[11px] text-ink-mid">
            <span>
              {field.hint ?? "Empty textarea = use the built-in default."}
            </span>
            {!hasOverride && defaultValue && (
              <span className="italic">Showing default as placeholder.</span>
            )}
          </div>
        </>
      )}

      {/* ── Action row ──────────────────────────────────────────────── */}
      {!isDynamic && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Save */}
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

          {/* Reset (only if there's a saved override) */}
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
                onChange(""); // optimistic clear
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

          {/* DeepL — only on EN tab, only when there's a value to push */}
          {locale === Locale.EN && value.trim() && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("emailKey", emailKey);
                fd.set("fieldKey", field.key);
                fd.set("value", value);
                run("translate", fd, translateEmailFieldAction);
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

          {/* Groq polish */}
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
                run("polish", fd, polishEmailFieldAction);
              }}
              className="inline-flex items-center gap-1.5 border border-ink/15 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink transition-colors hover:border-vermilion hover:text-vermilion disabled:opacity-50"
              title="Polish with Groq — rewrites this value in the same locale, brand voice"
            >
              {busyKind === "polish" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Polish with AI
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
