"use client";

// ─────────────────────────────────────────────────────────────────────────
// HeroPopupForm — admin editor for /admin/marketing/hero-popup.
//
// Layout:
//   ┌─ Toggles + delay  ──────────────────────┐
//   │                                         │
//   │ Product picker (drag-to-reorder)        │
//   │   · Chosen list (3-6 cards)             │
//   │   · "Add product" search/dropdown       │
//   │                                         │
//   │ Locale tabs: EN | NL | FR | RU          │
//   │   per-field input/textarea              │
//   │   EN tab adds [Polish] [Translate] btns │
//   │                                         │
//   │ [Save]                                  │
//   └─────────────────────────────────────────┘
//
// Drag-to-reorder uses native HTML5 dragstart/dragover/drop — no
// library, no virtual list. The chosen list is small (3-6) so the
// O(n²) DOM moves don't matter, and the touch-up of the keyboard
// path (↑↓ arrows on a focused chip) is left for a follow-up.
//
// Polish/Translate buttons live on the EN tab only. Polish rewrites
// the EN field in place via Groq; Translate fires DeepL and pushes
// the result into NL/FR/RU. Both server-actions persist to the DB
// so refreshing the page keeps the changes — there's no "draft" state.
// ─────────────────────────────────────────────────────────────────────────

import {
  useActionState,
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  AlertCircle,
  Check,
  GripVertical,
  Languages,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Locale } from "@prisma/client";

import { cn } from "@/lib/utils";
// Import from the types-only module — the main hero-popup module is
// "server-only" and would refuse to bundle into this client tree.
import {
  HERO_POPUP_FIELDS,
  type HeroPopupCopy,
  type HeroPopupSettings,
  type HeroPopupPickerOption,
} from "@/lib/queries/hero-popup-types";
import {
  saveHeroPopupAction,
  translateHeroPopupAction,
  polishHeroPopupAction,
  type HeroPopupActionState,
} from "@/app/admin/marketing/hero-popup/actions";

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];
const MIN_PRODUCTS = 3;
const MAX_PRODUCTS = 6;

type CopyByLocale = Record<Locale, HeroPopupCopy>;

const FIELD_KEYS = HERO_POPUP_FIELDS.map((f) => f.key);

export function HeroPopupForm({
  initial,
  pickerOptions,
}: {
  initial: HeroPopupSettings;
  pickerOptions: HeroPopupPickerOption[];
}) {
  // Top-level state.
  const [enabled, setEnabled] = useState<boolean>(initial.enabled);
  const [delay, setDelay] = useState<number>(initial.delaySeconds);
  const [pickedIds, setPickedIds] = useState<string[]>(initial.productIds);
  const [copy, setCopy] = useState<CopyByLocale>(initial.copy);
  const [activeLocale, setActiveLocale] = useState<Locale>(Locale.EN);

  // Picker dropdown state — search filter for the "add product" widget.
  const [pickerQuery, setPickerQuery] = useState<string>("");

  // Build a id → option lookup once.
  const optionsById = useMemo(
    () => new Map(pickerOptions.map((o) => [o.id, o])),
    [pickerOptions],
  );

  const pickedCount = pickedIds.length;
  const pickedAtCap = pickedCount >= MAX_PRODUCTS;
  const pickedBelowMin = pickedCount < MIN_PRODUCTS;

  const updateField = (loc: Locale, key: keyof HeroPopupCopy, value: string) => {
    setCopy((prev) => ({ ...prev, [loc]: { ...prev[loc], [key]: value } }));
  };

  const removePicked = (id: string) => {
    setPickedIds((prev) => prev.filter((x) => x !== id));
  };

  const addPicked = (id: string) => {
    setPickedIds((prev) => {
      if (prev.includes(id) || prev.length >= MAX_PRODUCTS) return prev;
      return [...prev, id];
    });
    setPickerQuery("");
  };

  // ── drag-to-reorder ─────────────────────────────────────────────────
  const dragSrc = useRef<number | null>(null);
  const onDragStart = (idx: number) => () => {
    dragSrc.current = idx;
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const onDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragSrc.current;
    dragSrc.current = null;
    if (src === null || src === idx) return;
    setPickedIds((prev) => {
      const next = [...prev];
      const [item] = next.splice(src, 1);
      next.splice(idx, 0, item);
      return next;
    });
  };

  // ── Polish / Translate plumbing (only used on the EN tab) ───────────
  const polishInitial: HeroPopupActionState & { polishedValue?: string } = {
    ok: false,
  };
  const translateInitial: HeroPopupActionState & {
    translations?: Partial<Record<Locale, string>>;
  } = { ok: false };

  // Per-field action state — to keep things simple we use one transition
  // and track which field/which kind is in flight via state, instead of
  // N separate action states.
  const [busy, setBusy] = useState<{
    fieldKey: keyof HeroPopupCopy;
    kind: "polish" | "translate";
  } | null>(null);
  const [polishMsg, setPolishMsg] = useState<{
    fieldKey: keyof HeroPopupCopy;
    error: string | null;
  } | null>(null);
  const [, startTransition] = useTransition();

  const runPolish = (fieldKey: keyof HeroPopupCopy, currentValue: string) => {
    if (!currentValue.trim()) return;
    setBusy({ fieldKey, kind: "polish" });
    setPolishMsg({ fieldKey, error: null });
    startTransition(async () => {
      const fd = new FormData();
      fd.set("fieldKey", fieldKey);
      fd.set("value", currentValue);
      const result = await polishHeroPopupAction(polishInitial, fd);
      if (result.ok && result.polishedValue) {
        updateField(Locale.EN, fieldKey, result.polishedValue);
      } else if (!result.ok) {
        setPolishMsg({
          fieldKey,
          error: result.message ?? "Polish failed.",
        });
      }
      setBusy(null);
    });
  };

  const runTranslate = (fieldKey: keyof HeroPopupCopy, currentValue: string) => {
    if (!currentValue.trim()) return;
    setBusy({ fieldKey, kind: "translate" });
    setPolishMsg({ fieldKey, error: null });
    startTransition(async () => {
      const fd = new FormData();
      fd.set("fieldKey", fieldKey);
      fd.set("value", currentValue);
      const result = await translateHeroPopupAction(translateInitial, fd);
      if (result.ok && result.translations) {
        for (const [loc, val] of Object.entries(result.translations)) {
          if (val) updateField(loc as Locale, fieldKey, val);
        }
      } else if (!result.ok) {
        setPolishMsg({
          fieldKey,
          error: result.message ?? "Translate failed.",
        });
      }
      setBusy(null);
    });
  };

  // ── Save (full form action via formData) ────────────────────────────
  const [saveError, setSaveError] = useState<string | null>(null);
  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      // Validation: 3-6 products required if enabled. Block submit
      // before hitting the server action.
      if (enabled && pickedBelowMin) {
        e.preventDefault();
        setSaveError(
          `Pick at least ${MIN_PRODUCTS} products before turning the popup on.`,
        );
        return;
      }
      setSaveError(null);
      // Otherwise let the form submit through to the server action.
    },
    [enabled, pickedBelowMin],
  );

  // ── filtered picker results ─────────────────────────────────────────
  const filteredOptions = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return pickerOptions
      .filter((o) => !pickedIds.includes(o.id))
      .filter((o) => (q === "" ? true : o.name.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [pickerOptions, pickedIds, pickerQuery]);

  return (
    <form action={saveHeroPopupAction} onSubmit={onSubmit} className="space-y-10">
      {/* hidden inputs that mirror the controlled state into FormData */}
      {enabled && <input type="hidden" name="enabled" value="on" />}
      <input type="hidden" name="delaySeconds" value={delay} />
      <input
        type="hidden"
        name="productIdsCsv"
        value={pickedIds.join(",")}
      />
      {LOCALES.map((loc) =>
        FIELD_KEYS.map((k) => (
          <input
            key={`${loc}.${k}`}
            type="hidden"
            name={`${loc}.${k}`}
            value={copy[loc][k] ?? ""}
          />
        )),
      )}

      {/* ── enable + delay ───────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-6 border border-ink/10 bg-white/60 p-5 md:grid-cols-2">
        <div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-ink"
            />
            <span>
              <span className="text-[12px] font-medium uppercase tracking-label text-ink">
                Show the popup
              </span>
              <span className="mt-1 block text-[12px] text-ink-mid">
                Master switch. Off = no popup ever fires, regardless of
                products or copy.
              </span>
            </span>
          </label>
        </div>
        <div>
          <label className="block text-[12px] font-medium uppercase tracking-label text-ink">
            Delay
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={60}
              value={delay}
              onChange={(e) =>
                setDelay(
                  Math.max(0, Math.min(60, Number(e.target.value) || 0)),
                )
              }
              className="w-24 border border-ink/15 bg-white px-3 py-2 text-[14px] text-ink focus:border-ink focus:outline-none"
            />
            <span className="text-[13px] text-ink-mid">seconds</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-mid">
            How long after the welcome popup is finished before this one
            starts to appear. 0 = immediate.
          </p>
        </div>
      </section>

      {/* ── product picker ───────────────────────────────────────── */}
      <section>
        <header className="flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Products</div>
            <h2 className="mt-1 font-display text-[20px] text-ink">
              Pick {MIN_PRODUCTS}–{MAX_PRODUCTS} pieces
            </h2>
            <p className="mt-1 max-w-xl text-[12px] text-ink-mid">
              Drag the cards to reorder. The popup arranges them like a
              magazine mosaic: positions <strong className="font-medium text-ink">1–2</strong>{" "}
              are top squares, <strong className="font-medium text-ink">3</strong> is the
              wide centre row, and <strong className="font-medium text-ink">4–6</strong>{" "}
              fill the bottom row. Put the piece you most want clicked into
              slot 3 — it gets the most visual weight.
            </p>
          </div>
          <div className="text-[11px] uppercase tracking-label text-ink-mid">
            {pickedCount} / {MAX_PRODUCTS}
          </div>
        </header>

        {/* chosen cards */}
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {pickedIds.map((id, idx) => {
            const o = optionsById.get(id);
            if (!o) return null;
            return (
              <li
                key={id}
                draggable
                onDragStart={onDragStart(idx)}
                onDragOver={onDragOver}
                onDrop={onDrop(idx)}
                className="group relative cursor-move border border-ink/15 bg-white"
              >
                <div className="aspect-square w-full bg-rice-dim">
                  {o.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={o.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-label text-ink-mid">
                      No image
                    </div>
                  )}
                </div>
                <div className="px-2 py-2">
                  <div className="line-clamp-2 text-[11px] leading-tight text-ink">
                    {o.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removePicked(id)}
                  aria-label="Remove"
                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center bg-white/90 text-ink transition-colors hover:bg-vermilion hover:text-rice"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div
                  className="absolute left-1 top-1 inline-flex h-6 w-6 items-center justify-center bg-white/85 text-ink-mid"
                  aria-hidden
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </div>
                <div className="absolute bottom-1 left-1 inline-flex h-5 w-5 items-center justify-center bg-ink text-[10px] font-mono text-rice">
                  {idx + 1}
                </div>
              </li>
            );
          })}
          {pickedCount === 0 && (
            <li className="col-span-full border border-dashed border-ink/15 bg-rice-dim/40 p-6 text-center text-[12px] text-ink-mid">
              No products yet — search below to add one.
            </li>
          )}
        </ol>

        {/* searchable add row */}
        {!pickedAtCap && (
          <div className="mt-5 border border-ink/10 bg-white/60 p-4">
            <label className="text-[11px] uppercase tracking-label text-ink-mid">
              Add a product
            </label>
            <input
              type="text"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Type to search the catalogue…"
              className="mt-2 w-full border border-ink/15 bg-white px-3 py-2 text-[14px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
            />
            {pickerQuery && filteredOptions.length === 0 && (
              <p className="mt-2 text-[12px] text-ink-mid">
                No matches.
              </p>
            )}
            {filteredOptions.length > 0 && (
              <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {filteredOptions.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => addPicked(o.id)}
                      className="flex w-full items-center gap-3 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-ink/15 hover:bg-rice-dim/40"
                    >
                      <div className="h-8 w-8 flex-shrink-0 bg-rice-dim">
                        {o.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={o.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                        {o.name}
                      </span>
                      <Plus className="h-3.5 w-3.5 text-ink-mid" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {pickedAtCap && (
          <p className="mt-3 text-[12px] text-ink-mid">
            You've reached the {MAX_PRODUCTS}-product cap. Remove one to
            add another.
          </p>
        )}
      </section>

      {/* ── locale tabs + copy ───────────────────────────────────── */}
      <section>
        <header className="flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Copy</div>
            <h2 className="mt-1 font-display text-[20px] text-ink">
              Words on the popup
            </h2>
            <p className="mt-1 max-w-xl text-[12px] text-ink-mid">
              Edit the EN tab first. Use{" "}
              <span className="inline-flex items-center gap-1 text-vermilion">
                <Sparkles className="h-3 w-3" /> Polish
              </span>{" "}
              to refine an English phrase, then{" "}
              <span className="inline-flex items-center gap-1 text-vermilion">
                <Languages className="h-3 w-3" /> Translate
              </span>{" "}
              to fan it out to NL / FR / RU. Empty NL/FR/RU fields fall back
              to the English line.
            </p>
          </div>
        </header>

        {/* tabs */}
        <div
          role="tablist"
          aria-label="Locale"
          className="mt-5 flex items-center gap-1 border-b border-ink/10"
        >
          {LOCALES.map((loc) => {
            const isActive = activeLocale === loc;
            const filledCount = FIELD_KEYS.filter((k) =>
              copy[loc][k]?.trim(),
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
                {filledCount > 0 && (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-medium",
                      filledCount === FIELD_KEYS.length
                        ? "bg-celadon/20 text-celadon"
                        : "bg-gold/20 text-gold",
                    )}
                    title={`${filledCount}/${FIELD_KEYS.length} filled`}
                  >
                    {filledCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* fields */}
        <div className="mt-5 space-y-5">
          {HERO_POPUP_FIELDS.map((field) => {
            const value = copy[activeLocale][field.key] ?? "";
            const isEN = activeLocale === Locale.EN;
            const isPolishing =
              busy?.fieldKey === field.key && busy.kind === "polish";
            const isTranslating =
              busy?.fieldKey === field.key && busy.kind === "translate";
            const fieldErr =
              polishMsg?.fieldKey === field.key ? polishMsg.error : null;
            return (
              <div
                key={field.key}
                className="border border-ink/10 bg-white/60 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[12px] font-medium uppercase tracking-label text-ink">
                    {field.label}
                  </label>
                </div>
                {field.multiline ? (
                  <textarea
                    value={value}
                    onChange={(e) =>
                      updateField(activeLocale, field.key, e.target.value)
                    }
                    rows={3}
                    placeholder={
                      isEN
                        ? field.hint
                        : copy[Locale.EN][field.key] || field.hint
                    }
                    className="mt-2 w-full resize-y border border-ink/15 bg-white px-3 py-2 text-[14px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
                  />
                ) : (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      updateField(activeLocale, field.key, e.target.value)
                    }
                    placeholder={
                      isEN
                        ? field.hint
                        : copy[Locale.EN][field.key] || field.hint
                    }
                    className="mt-2 w-full border border-ink/15 bg-white px-3 py-2 text-[14px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
                  />
                )}
                {field.hint && (
                  <p className="mt-1 text-[11px] text-ink-mid">{field.hint}</p>
                )}

                {/* AI buttons: EN tab only, requires non-empty value */}
                {isEN && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!value.trim() || busy !== null}
                      onClick={() => runPolish(field.key, value)}
                      className="inline-flex items-center gap-1.5 border border-ink/15 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink transition-colors hover:border-vermilion hover:text-vermilion disabled:opacity-40"
                    >
                      {isPolishing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      Polish
                    </button>
                    <button
                      type="button"
                      disabled={!value.trim() || busy !== null}
                      onClick={() => runTranslate(field.key, value)}
                      className="inline-flex items-center gap-1.5 border border-vermilion/30 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-vermilion transition-colors hover:bg-vermilion/5 disabled:opacity-40"
                    >
                      {isTranslating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Languages className="h-3 w-3" />
                      )}
                      Translate to NL/FR/RU
                    </button>
                    {fieldErr && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-vermilion">
                        <AlertCircle className="h-3 w-3" />
                        {fieldErr}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── save bar ─────────────────────────────────────────────── */}
      <div className="sticky bottom-0 border-t border-ink/10 bg-rice/95 px-1 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[12px] text-ink-mid">
            {pickedBelowMin && enabled && (
              <span className="inline-flex items-center gap-1 text-vermilion">
                <AlertCircle className="h-3 w-3" />
                At least {MIN_PRODUCTS} products required when the popup is on.
              </span>
            )}
            {saveError && (
              <span className="inline-flex items-center gap-1 text-vermilion">
                <AlertCircle className="h-3 w-3" />
                {saveError}
              </span>
            )}
            {!pickedBelowMin && enabled && (
              <span className="inline-flex items-center gap-1 text-celadon">
                <Check className="h-3 w-3" />
                Ready to save.
              </span>
            )}
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2.5 text-[12px] uppercase tracking-label text-rice transition-opacity hover:opacity-90"
          >
            Save changes
          </button>
        </div>
      </div>
    </form>
  );
}
