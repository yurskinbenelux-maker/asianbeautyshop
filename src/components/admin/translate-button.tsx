// ─────────────────────────────────────────────────────────────────────────
// TranslateFromEnglishButton — reusable client component used by both the
// product and ingredient editors.
//
// What it does (in plain English):
//   1. The admin clicks the button on a non-EN tab.
//   2. We collect the EN values for each field (passed in via the
//      `getSource` callback so the button works whether the source lives
//      in props or in DOM refs).
//   3. We call the translate server action.
//   4. We hand the translations back via `onTranslated` — the parent form
//      decides what to do (set state, write to refs, etc.).
//
// "Fill blanks only" vs "overwrite": the button shows a small inline
// checkbox so an admin can choose. Default is blanks-only — re-clicking
// after manual corrections is safe.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Locale } from "@prisma/client";
import { translateFieldsAction } from "@/app/admin/translate/actions";
import { cn } from "@/lib/utils";

type Field = {
  /** Unique field key (used for the input name in the parent form). */
  name: string;
  /** Whether this field stores HTML (description, howToUse, warnings…). */
  isHtml: boolean;
  /** Current value in the target locale. Used to decide whether to skip
   *  this field when "fill blanks only" is on. */
  currentValue: string;
};

type Props = {
  /** Target locale to translate into. EN is rejected by the server. */
  targetLocale: Locale;
  /** All fields handled by this button. The parent provides the list so
   *  the button doesn't need to know the editor's schema. */
  fields: Field[];
  /** Returns the EN source values keyed by field name. Called every time
   *  the button is clicked so the latest saved EN copy is used. */
  getSource: () => Record<string, string>;
  /** Receives the translation map (only fields that were sent). The parent
   *  applies them to its inputs / state. */
  onTranslated: (translations: Record<string, string>) => void;
  /** Optional className passthrough so the button can be tucked into
   *  different layouts without a wrapper div. */
  className?: string;
  /** Compact version (small button, no checkbox) — used for the
   *  ingredient editor where each locale row is space-constrained. */
  compact?: boolean;
};

const LOCALE_LABEL: Record<Locale, string> = {
  EN: "English",
  NL: "Dutch",
  FR: "French",
  RU: "Russian",
};

export function TranslateFromEnglishButton({
  targetLocale,
  fields,
  getSource,
  onTranslated,
  className,
  compact = false,
}: Props) {
  const [overwrite, setOverwrite] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    | { kind: "ok"; text: string }
    | { kind: "error"; text: string }
    | null
  >(null);

  function run() {
    setMessage(null);

    const source = getSource();

    // Decide which fields to actually send. By default we skip fields
    // that are already filled in the target locale — that way an admin's
    // manual edits aren't clobbered by a re-click. With "overwrite" on,
    // we send everything that has English content.
    const toSend = fields.filter((f) => {
      const enValue = (source[f.name] ?? "").trim();
      if (enValue.length === 0) return false; // nothing to translate
      if (overwrite) return true;
      return f.currentValue.trim().length === 0;
    });

    if (toSend.length === 0) {
      setMessage({
        kind: "ok",
        text: overwrite
          ? "No English content to translate yet — fill in English first."
          : "Already translated. Tick 'Overwrite' to redo from English.",
      });
      return;
    }

    const fieldsPayload: Record<string, { value: string; isHtml: boolean }> = {};
    for (const f of toSend) {
      fieldsPayload[f.name] = {
        value: source[f.name] ?? "",
        isHtml: f.isHtml,
      };
    }

    startTransition(async () => {
      try {
        const result = await translateFieldsAction({
          fields: fieldsPayload,
          targetLocale,
        });
        if (!result.ok) {
          setMessage({ kind: "error", text: result.message });
          return;
        }
        onTranslated(result.translations);
        setMessage({
          kind: "ok",
          text: `Translated ${Object.keys(result.translations).length} field${
            Object.keys(result.translations).length === 1 ? "" : "s"
          }. Review and edit before saving.`,
        });
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

  if (compact) {
    return (
      <div className={cn("flex flex-col items-end gap-1", className)}>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1.5 border border-ink/20 bg-white px-2.5 py-1 text-[10.5px] uppercase tracking-label text-ink-mid transition-colors",
            pending
              ? "opacity-60"
              : "hover:border-ink hover:text-ink",
          )}
          title={`Auto-translate from English to ${LOCALE_LABEL[targetLocale]}`}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          {pending ? "Translating…" : "Translate from EN"}
        </button>
        {message && (
          <p
            className={cn(
              "text-[10.5px]",
              message.kind === "error" ? "text-vermilion" : "text-ink-mid",
            )}
          >
            {message.text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border border-dashed border-ink/20 bg-rice/30 px-4 py-3",
        className,
      )}
    >
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-2 border border-ink bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink transition-colors",
          pending ? "opacity-60" : "hover:bg-ink hover:text-rice",
        )}
      >
        <Sparkles className="h-3 w-3" aria-hidden />
        {pending
          ? "Translating…"
          : `Auto-translate from English to ${LOCALE_LABEL[targetLocale]}`}
      </button>

      <label className="inline-flex items-center gap-2 text-[11px] text-ink-mid">
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(e) => setOverwrite(e.target.checked)}
          className="h-3.5 w-3.5 accent-vermilion"
        />
        Overwrite existing values
      </label>

      <span className="text-[11px] text-ink-mid">
        Fills empty fields with translations of the saved English values.
      </span>

      {message && (
        <p
          className={cn(
            "basis-full text-[11px]",
            message.kind === "error" ? "text-vermilion" : "text-ink",
          )}
        >
          {message.kind === "error" && (
            <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden />
          )}
          {message.text}
        </p>
      )}
    </div>
  );
}
