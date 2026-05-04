// ─────────────────────────────────────────────────────────────────────────
// TagRow — one row in the simple-taxonomy list. Clicking Edit expands
// the row into an inline form with a tab strip for locales. Delete is a
// separate mini-form under the same row so each row carries its own
// useActionState and error surface.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Locale } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  deleteSimpleTaxonomyAction,
  updateSimpleTaxonomyAction,
  type ActionState,
} from "@/app/admin/categories/actions";
import type { SimpleTaxonomyKind } from "@/lib/queries/admin-taxonomies";
import { TranslateFromEnglishButton } from "@/components/admin/translate-button";

const INITIAL: ActionState = { ok: false };
const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

export type TagRowData = {
  id: string;
  slug: string;
  icon?: string | null;
  labels: Record<Locale, string>;
  productCount: number;
};

export function TagRow({
  kind,
  row,
  hasIcon,
}: {
  kind: SimpleTaxonomyKind;
  row: TagRowData;
  hasIcon: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="border-b border-ink/5 last:border-b-0">
      <div className="flex items-center gap-4 px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] text-ink">
              {row.labels.EN || row.slug}
            </span>
            {hasIcon && row.icon && (
              <span className="inline-block border border-ink/10 bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-mid">
                {row.icon}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-mid">
            <span>/{row.slug}</span>
            <LocaleDots labels={row.labels} />
          </div>
        </div>

        <span className="text-[11px] uppercase tracking-label text-ink-mid">
          {row.productCount} product{row.productCount === 1 ? "" : "s"}
        </span>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 border border-ink/15 px-2.5 py-1.5 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
        >
          {open ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Close
            </>
          ) : (
            <>
              <Pencil className="h-3 w-3" />
              Edit
            </>
          )}
        </button>
      </div>

      {open && (
        <div className="border-t border-ink/5 bg-rice/40 px-5 py-5">
          <EditForm kind={kind} row={row} hasIcon={hasIcon} onDone={() => setOpen(false)} />
          <DeleteMiniForm kind={kind} id={row.id} count={row.productCount} />
        </div>
      )}
    </li>
  );
}

function LocaleDots({ labels }: { labels: Record<Locale, string> }) {
  return (
    <span className="inline-flex items-center gap-1">
      {LOCALES.map((l) => (
        <span
          key={l}
          className={cn(
            "inline-flex h-4 items-center border px-1 text-[9px] uppercase tracking-label",
            labels[l]
              ? "border-sage/40 bg-sage/10 text-sage"
              : "border-ink/10 bg-white text-ink-mid/60",
          )}
          title={labels[l] || `No ${l} translation`}
        >
          {l}
        </span>
      ))}
    </span>
  );
}

function EditForm({
  kind,
  row,
  hasIcon,
  onDone,
}: {
  kind: SimpleTaxonomyKind;
  row: TagRowData;
  hasIcon: boolean;
  onDone: () => void;
}) {
  const [state, action] = useActionState(updateSimpleTaxonomyAction, INITIAL);
  const err = state.fieldErrors ?? {};
  const [active, setActive] = useState<Locale>(Locale.EN);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function getEnSource(): Record<string, string> {
    return { label: inputRefs.current[Locale.EN]?.value ?? "" };
  }

  function applyTranslations(
    locale: Locale,
    translations: Record<string, string>,
  ) {
    const el = inputRefs.current[locale];
    if (el && typeof translations.label === "string") {
      el.value = translations.label;
    }
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={row.id} />

      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <div>
          <div className="flex items-center gap-1 border-b border-ink/10">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setActive(l)}
                aria-pressed={active === l}
                className={cn(
                  "border-b-2 px-2.5 py-1.5 text-[11px] uppercase tracking-label transition-colors",
                  active === l
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-mid hover:text-ink",
                )}
              >
                {l}
              </button>
            ))}
          </div>

          {LOCALES.map((l) => (
            <div key={l} className={cn("pt-3", active !== l && "hidden")}>
              {l !== Locale.EN && (
                <div className="mb-3">
                  <TranslateFromEnglishButton
                    compact
                    targetLocale={l}
                    fields={[
                      {
                        name: "label",
                        isHtml: false,
                        currentValue:
                          inputRefs.current[l]?.value ?? row.labels[l] ?? "",
                      },
                    ]}
                    getSource={getEnSource}
                    onTranslated={(tr) => applyTranslations(l, tr)}
                  />
                </div>
              )}
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                  Label ({l})
                </span>
                <input
                  ref={(el) => {
                    inputRefs.current[l] = el;
                  }}
                  name={`translations.${l}.label`}
                  defaultValue={row.labels[l] ?? ""}
                  placeholder={
                    l === Locale.EN ? "e.g. Dullness" : "Leave blank to omit"
                  }
                  className="input"
                />
              </label>
            </div>
          ))}

          {err["translations.EN.label"]?.[0] && (
            <p className="mt-2 text-[11px] text-vermilion">
              {err["translations.EN.label"][0]}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
              Slug
            </span>
            <input
              name="slug"
              defaultValue={row.slug}
              className="input"
            />
            {err.slug?.[0] && (
              <span className="mt-1 block text-[11px] text-vermilion">
                {err.slug[0]}
              </span>
            )}
          </label>

          {hasIcon && (
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                Icon (lucide name)
              </span>
              <input
                name="icon"
                defaultValue={row.icon ?? ""}
                placeholder="e.g. Droplet"
                className="input"
              />
            </label>
          )}
        </div>
      </div>

      {state.message && (
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-[12px]",
            state.ok ? "text-sage" : "text-vermilion",
          )}
          role="status"
        >
          {state.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-2">
        <SaveButton />
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1 border border-ink/15 px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteMiniForm({
  kind,
  id,
  count,
}: {
  kind: SimpleTaxonomyKind;
  id: string;
  count: number;
}) {
  const [state, action] = useActionState(deleteSimpleTaxonomyAction, INITIAL);

  return (
    <form action={action} className="mt-5 flex items-center gap-2 border-t border-ink/10 pt-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <DeleteButton disabled={count > 0} />
      {count > 0 && (
        <span className="text-[11px] text-ink-mid">
          Remove this tag from {count} product{count === 1 ? "" : "s"} before
          deleting.
        </span>
      )}
      {state.message && !state.ok && (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-vermilion"
          role="status"
        >
          <AlertCircle className="h-3 w-3" />
          {state.message}
        </span>
      )}
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Save className="h-3 w-3" />
      )}
      Save
    </button>
  );
}

function DeleteButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center gap-1 border border-vermilion/40 px-3 py-1.5 text-[11px] uppercase tracking-label text-vermilion hover:bg-vermilion hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-vermilion"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Trash2 className="h-3 w-3" />
      )}
      Delete
    </button>
  );
}
