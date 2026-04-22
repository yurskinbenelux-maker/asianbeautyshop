"use client";

// ─────────────────────────────────────────────────────────────────────────
// CouponForm — shared create/edit form.
//
// Swaps the submit action depending on `mode`. The kind selector is a
// controlled segmented control because we need to hide the "value" input
// when "FREE_SHIPPING" is chosen (there's nothing to enter).
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useState } from "react";
import {
  createCouponAction,
  updateCouponAction,
  type ActionState,
} from "@/app/admin/coupons/actions";
import {
  Field,
  SaveBar,
  StatusBanner,
} from "@/components/admin/settings/settings-chrome";

type CouponKind = "PERCENT" | "FIXED" | "FREE_SHIPPING";

export type CouponFormInitial = {
  code: string;
  kind: CouponKind;
  value: number; // percent for PERCENT, cents for FIXED, 0 for FREE_SHIPPING
  minSubtotalCents: number | null;
  maxRedemptions: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  firstOrderOnly: boolean;
};

const EMPTY: CouponFormInitial = {
  code: "",
  kind: "PERCENT",
  value: 10,
  minSubtotalCents: null,
  maxRedemptions: null,
  startsAt: null,
  endsAt: null,
  isActive: true,
  firstOrderOnly: false,
};

const INITIAL_STATE: ActionState = { ok: false };

export function CouponForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: CouponFormInitial;
}) {
  const data = initial ?? EMPTY;
  const action =
    mode === "create" ? createCouponAction : updateCouponAction;
  const [state, dispatch] = useActionState(action, INITIAL_STATE);
  const err = state.fieldErrors ?? {};

  const [kind, setKind] = useState<CouponKind>(data.kind);
  const needsValue = kind !== "FREE_SHIPPING";

  // Date inputs need yyyy-MM-dd.
  const startsAtStr = toYmd(data.startsAt);
  const endsAtStr = toYmd(data.endsAt);

  // Convert stored value to what the input shows.
  const defaultValueInput =
    data.kind === "FIXED" ? (data.value / 100).toFixed(2) : String(data.value);

  return (
    <form action={dispatch} className="max-w-2xl space-y-6">
      {mode === "edit" && (
        <input type="hidden" name="originalCode" value={data.code} />
      )}

      <Field
        label="Code"
        hint="Customers type this at checkout. Uppercase, letters + digits, hyphens or underscores."
        error={err.code?.[0]}
      >
        <input
          name="code"
          defaultValue={data.code}
          className="input font-mono uppercase tracking-label"
          required
          maxLength={40}
          placeholder="WELCOME10"
        />
      </Field>

      <Field label="Discount type" error={err.kind?.[0]}>
        <div className="inline-flex rounded-none border border-ink/20 bg-white p-1 text-[12px]">
          {(
            [
              { id: "PERCENT", label: "Percent off" },
              { id: "FIXED", label: "Fixed amount" },
              { id: "FREE_SHIPPING", label: "Free shipping" },
            ] as { id: CouponKind; label: string }[]
          ).map((opt) => {
            const on = kind === opt.id;
            return (
              <label
                key={opt.id}
                className={
                  on
                    ? "cursor-pointer bg-ink px-3 py-1.5 text-white"
                    : "cursor-pointer px-3 py-1.5 text-ink-mid hover:text-ink"
                }
              >
                <input
                  type="radio"
                  name="kind"
                  value={opt.id}
                  checked={on}
                  onChange={() => setKind(opt.id)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </Field>

      {needsValue && (
        <Field
          label={kind === "PERCENT" ? "Percent off (%)" : "Amount off (€)"}
          hint={
            kind === "PERCENT"
              ? "Between 0.01 and 100. Entered as 10 for 10%."
              : "In euros — 5.00 for €5 off the order."
          }
          error={err.valueRaw?.[0]}
        >
          <input
            name="valueRaw"
            type="number"
            step={kind === "PERCENT" ? "0.1" : "0.01"}
            min="0"
            defaultValue={defaultValueInput}
            className="input max-w-[12rem]"
            required
          />
        </Field>
      )}

      <Field
        label="Minimum order subtotal (€)"
        hint="Optional. The coupon only applies if the order subtotal meets this. Leave blank or 0 for no minimum."
        error={err.minSubtotalEuros?.[0]}
      >
        <input
          name="minSubtotalEuros"
          type="number"
          step="0.01"
          min="0"
          defaultValue={
            data.minSubtotalCents != null
              ? (data.minSubtotalCents / 100).toFixed(2)
              : ""
          }
          className="input max-w-[12rem]"
          placeholder="0.00"
        />
      </Field>

      <Field
        label="Maximum redemptions"
        hint="Optional total cap across all customers. Leave blank for unlimited."
        error={err.maxRedemptions?.[0]}
      >
        <input
          name="maxRedemptions"
          type="number"
          min="0"
          step="1"
          defaultValue={data.maxRedemptions ?? ""}
          className="input max-w-[12rem]"
          placeholder="unlimited"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts at" error={err.startsAt?.[0]}>
          <input
            name="startsAt"
            type="date"
            defaultValue={startsAtStr}
            className="input"
          />
        </Field>
        <Field label="Ends at" error={err.endsAt?.[0]}>
          <input
            name="endsAt"
            type="date"
            defaultValue={endsAtStr}
            className="input"
          />
        </Field>
      </div>

      <div className="space-y-3 border-t border-ink/10 pt-6">
        <label className="flex items-start gap-2 text-[12px] text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={data.isActive}
            className="mt-0.5 h-3.5 w-3.5 accent-ink"
          />
          <span>
            <span>Active</span>
            <span className="mt-0.5 block text-[11px] text-ink-mid">
              Inactive codes are rejected at checkout even if the schedule
              allows them.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-[12px] text-ink">
          <input
            type="checkbox"
            name="firstOrderOnly"
            defaultChecked={data.firstOrderOnly}
            className="mt-0.5 h-3.5 w-3.5 accent-ink"
          />
          <span>
            <span>First order only</span>
            <span className="mt-0.5 block text-[11px] text-ink-mid">
              Rejected for customers who already have any prior paid order.
            </span>
          </span>
        </label>
      </div>

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}

function toYmd(d: Date | null): string {
  if (!d) return "";
  const iso = new Date(d).toISOString();
  return iso.slice(0, 10);
}
