// ─────────────────────────────────────────────────────────────────────────
// ReturnForm — client form for submitting a return request.
//
// The per-item qty input uses +/- buttons so the touch UI is pleasant on
// mobile. The reason select, details textarea, and submit button are
// styled to match the account profile form for visual consistency.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";

import { formatEur, priceLocale } from "@/lib/utils";
import { RETURN_REASON, type ReturnReason } from "@/lib/returns/types";

import { submitReturnRequest } from "./actions";
import { INITIAL_RETURN_FORM_STATE, type ReturnFormState } from "./form-state";

type ReturnableItem = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  thumbnailUrl: string | null;
};

export function ReturnForm({
  locale,
  orderNumber,
  items,
}: {
  locale: string;
  orderNumber: string;
  items: ReturnableItem[];
}) {
  const t = useTranslations("returns");
  const [state, formAction] = useActionState<ReturnFormState, FormData>(
    submitReturnRequest,
    INITIAL_RETURN_FORM_STATE,
  );

  // Track qty per item locally for the +/- controls.  The hidden input
  // with matching name is what submits.
  const [qty, setQty] = useState<Record<string, number>>(
    () => Object.fromEntries(items.map((i) => [i.id, 0])),
  );

  const bump = (id: string, delta: number, max: number) => {
    setQty((prev) => {
      const next = Math.max(0, Math.min(max, (prev[id] ?? 0) + delta));
      return { ...prev, [id]: next };
    });
  };

  const totalSelected = Object.values(qty).reduce((n, q) => n + q, 0);
  const euro = (v: number) => formatEur(v, priceLocale(locale));

  return (
    <form action={formAction} className="space-y-10">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orderNumber" value={orderNumber} />

      {/* ── items ──────────────────────────────────────────────── */}
      <fieldset>
        <legend className="eyebrow mb-4">{t("form_items_heading")}</legend>
        <ul className="divide-y divide-ink/10 border-y border-ink/10">
          {items.map((it) => {
            const current = qty[it.id] ?? 0;
            const fieldErr = state.fieldErrors?.[`qty_${it.id}`];
            return (
              <li
                key={it.id}
                className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:gap-6"
              >
                <div className="flex items-center gap-4 md:flex-1">
                  {it.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.thumbnailUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 border border-rice bg-white/50 object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 shrink-0 border border-ink/10 bg-white/50" />
                  )}
                  <div className="min-w-0">
                    <div className="font-display text-[15px] text-ink">
                      {it.name}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-mid">
                      {t("form_sku_price", {
                        sku: it.sku,
                        price: euro(it.unitPrice),
                      })}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-mid">
                      {t("form_ordered_qty", { qty: it.quantity })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 md:justify-end">
                  <div className="inline-flex items-center border border-ink/15 bg-white/50">
                    <button
                      type="button"
                      onClick={() => bump(it.id, -1, it.quantity)}
                      disabled={current === 0}
                      aria-label={t("form_qty_decrease")}
                      className="flex h-10 w-10 items-center justify-center text-ink-mid transition-colors hover:text-vermilion disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="text"
                      name={`qty_${it.id}`}
                      value={current}
                      readOnly
                      aria-label={t("form_qty_for_item", { name: it.name })}
                      className="h-10 w-10 bg-transparent text-center text-[14px] text-ink focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => bump(it.id, 1, it.quantity)}
                      disabled={current >= it.quantity}
                      aria-label={t("form_qty_increase")}
                      className="flex h-10 w-10 items-center justify-center text-ink-mid transition-colors hover:text-vermilion disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {fieldErr && (
                  <div className="mt-1 basis-full text-[11px] text-vermilion md:basis-auto">
                    {t(`form_field_err_${fieldErr}` as FieldErrKey)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[12px] text-ink-mid">
          {t("form_items_hint")}
        </p>
      </fieldset>

      {/* ── reason ─────────────────────────────────────────────── */}
      <fieldset>
        <legend className="eyebrow mb-4">{t("form_reason_heading")}</legend>
        <label className="block">
          <span className="sr-only">{t("form_reason_heading")}</span>
          <select
            name="reason"
            defaultValue="CHANGED_MIND"
            required
            className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink focus:border-ink focus:outline-none"
          >
            {RETURN_REASON.map((r) => (
              <option key={r} value={r}>
                {t(`reason.${r}` as ReasonKey)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {/* ── details ───────────────────────────────────────────── */}
      <fieldset>
        <legend className="eyebrow mb-4">{t("form_details_heading")}</legend>
        <label className="block">
          <span className="sr-only">{t("form_details_heading")}</span>
          <textarea
            name="details"
            rows={5}
            maxLength={2000}
            placeholder={t("form_details_placeholder")}
            className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] leading-relaxed text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
          />
        </label>
        <p className="mt-1.5 text-[11px] text-ink-mid">
          {t("form_details_hint")}
        </p>
      </fieldset>

      {/* ── form-level feedback ───────────────────────────────── */}
      {state.errorCode && state.errorCode !== "quantity_exceeds" && (
        <p role="alert" className="text-[12px] text-vermilion">
          {t(`form_error.${state.errorCode}` as ErrorKey)}
        </p>
      )}

      {/* ── submit ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-[12px] text-ink-mid">
          {t("form_summary", { count: totalSelected })}
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const t = useTranslations("returns");
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 bg-ink px-6 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? t("form_submitting") : t("form_submit")}
    </button>
  );
}

type ReasonKey = `reason.${ReturnReason}`;
type FieldErrKey = "form_field_err_invalid" | "form_field_err_exceeds";
type ErrorKey =
  | "form_error.invalid_order"
  | "form_error.no_items"
  | "form_error.invalid_reason"
  | "form_error.server_error"
  | "form_error.order_not_returnable";
