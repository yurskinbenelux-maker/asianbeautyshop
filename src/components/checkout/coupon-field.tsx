// ─────────────────────────────────────────────────────────────────────────
// CouponField — promo code with an Apply button at checkout.
//
// Sibling to GiftCardCodesField (same pattern, single code instead of a
// list of chips). Click Apply → server validates → chip appears with
// the discount preview ("ABS-WELCOME · 10% off"). The parent receives
// the validated coupon shape via `onCouponChange` so the order summary
// can show a strike-through subtotal + new grand total in real time.
//
// Submit-time safety: the coupon code rides along on the parent form
// via a hidden field (same as gift card codes). placeOrder() re-validates
// the row at submit time, so a stale tab can't fake a discount.
//
// The discount math itself (PERCENT × subtotal, FIXED capped at subtotal,
// FREE_SHIPPING) lives in lib/checkout/pricing.ts. This component just
// passes the validated coupon shape up to the parent.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Check, Plus, X } from "lucide-react";
import {
  lookupCouponAction,
  type CouponLookupResult,
} from "@/app/[locale]/checkout/coupon-actions";
import { cn } from "@/lib/utils";

/** Subset of CouponLookupResult that flows up to the parent for pricing. */
export type AppliedCoupon = {
  code: string;
  kind: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number;
  minSubtotal: number | null;
};

type Props = {
  /** Parent's callback — fires whenever an applied coupon is added or
   *  removed. Null means "no coupon applied" (used to clear the
   *  preview). */
  onCouponChange?: (coupon: AppliedCoupon | null) => void;
};

export function CouponField({ onCouponChange }: Props) {
  const t = useTranslations("checkout.coupon");
  const [draft, setDraft] = useState("");
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorReason, setErrorReason] =
    useState<Extract<CouponLookupResult, { ok: false }>["reason"] | null>(null);

  function tryApply() {
    const code = draft.trim().toUpperCase();
    if (!code) return;
    if (applied?.code === code) {
      // Already applied — no-op, just clear the draft so the input feels
      // responsive.
      setDraft("");
      return;
    }
    setErrorReason(null);
    startTransition(async () => {
      const res = await lookupCouponAction(code);
      if (!res.ok) {
        setErrorReason(res.reason);
        return;
      }
      const next: AppliedCoupon = {
        code: res.code,
        kind: res.kind,
        value: res.value,
        minSubtotal: res.minSubtotal,
      };
      setApplied(next);
      onCouponChange?.(next);
      setDraft("");
    });
  }

  function removeApplied() {
    setApplied(null);
    setErrorReason(null);
    onCouponChange?.(null);
  }

  // Submit on Enter without submitting the parent form (the parent's
  // submit handler would otherwise place the order on a stray Enter).
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      tryApply();
    }
  }

  // Short description for the applied chip — "10% off", "€5 off",
  // "Free shipping". Translated via the existing checkout namespace.
  function appliedSummary(c: AppliedCoupon): string {
    if (c.kind === "PERCENT") return t("summary_percent", { value: c.value });
    if (c.kind === "FREE_SHIPPING") return t("summary_free_shipping");
    return t("summary_fixed", { value: c.value.toFixed(2) });
  }

  return (
    <div>
      <label className="block">
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_label")}
        </span>
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setDraft(e.target.value.toUpperCase().slice(0, 40))
            }
            onKeyDown={handleKeyDown}
            placeholder={t("field_placeholder")}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            disabled={!!applied}
            className="flex-1 border border-ink/15 bg-white/50 px-4 py-3 font-mono text-[13px] tracking-wide text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none disabled:bg-ink/[0.02] disabled:text-ink-mid"
          />
          <button
            type="button"
            onClick={tryApply}
            disabled={!draft.trim() || isPending || !!applied}
            className={cn(
              "flex items-center gap-2 border px-4 py-3 text-[12px] uppercase tracking-label transition-colors",
              !draft.trim() || isPending || !!applied
                ? "cursor-not-allowed border-ink/15 text-ink-mid"
                : "border-ink bg-ink text-rice hover:bg-vermilion hover:border-vermilion",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("apply_label")}
          </button>
        </div>
      </label>

      {/* ── inline error ──────────────────────────────────────────── */}
      {errorReason ? (
        <p className="mt-2 text-[12px] text-vermilion">
          {t(`error_${errorReason}`)}
        </p>
      ) : null}

      {/* ── applied chip ──────────────────────────────────────────── */}
      {applied ? (
        <div className="mt-3 flex items-center justify-between border border-sage/40 bg-sage/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-sage" />
            <span className="font-mono text-[12px] tracking-wide text-ink">
              {applied.code}
            </span>
            <span className="text-[11px] uppercase tracking-label text-ink-mid">
              · {appliedSummary(applied)}
            </span>
          </div>
          <button
            type="button"
            onClick={removeApplied}
            aria-label={t("remove_label")}
            className="text-ink-mid transition-colors hover:text-vermilion"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* Submitted via the parent form. placeOrder() re-validates
       *  server-side at submit time. */}
      {applied ? (
        <input type="hidden" name="couponCode" value={applied.code} />
      ) : (
        <input type="hidden" name="couponCode" value="" />
      )}
    </div>
  );
}
