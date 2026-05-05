"use client";

// ─────────────────────────────────────────────────────────────────────────
// RewardForm — kind picker drives which extra fields appear:
//   PRODUCT_FREE   → product <select>
//   GIFT_CARD      → value input (EUR)
//   COUPON_FIXED   → value input (EUR)
//   COUPON_PERCENT → percent input (0..99)
//
// Used both inline on the list page (create) and on the per-id edit page.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useState } from "react";
import { LoyaltyRewardKind } from "@prisma/client";
import { saveRewardAction } from "./actions";

type State = { ok: boolean; message?: string };

async function submit(_prev: State, formData: FormData): Promise<State> {
  return saveRewardAction(formData);
}

export type RewardFormInitial = {
  id?: string;
  title?: string;
  description?: string | null;
  kind?: LoyaltyRewardKind;
  pointsCost?: number;
  productId?: string | null;
  valueCents?: number | null;
  percentOff?: number | null;
  iconKey?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type ProductOption = {
  id: string;
  label: string; // pre-built "SKU · Name" so this component doesn't need translations
};

export function RewardForm({
  initial,
  products,
}: {
  initial?: RewardFormInitial;
  products: ProductOption[];
}) {
  const [state, action, pending] = useActionState<State, FormData>(submit, {
    ok: false,
  });
  const [flash, setFlash] = useState<string | null>(null);
  const [kind, setKind] = useState<LoyaltyRewardKind>(
    initial?.kind ?? "COUPON_FIXED",
  );

  useEffect(() => {
    if (state.ok) {
      setFlash(state.message ?? "Saved.");
      const t = setTimeout(() => setFlash(null), 2400);
      return () => clearTimeout(t);
    }
  }, [state]);

  const initialValueEur =
    initial?.valueCents != null ? (initial.valueCents / 100).toFixed(2) : "";

  return (
    <form action={action} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <label className="block md:col-span-2">
        <div className="text-[12px] text-ink">Title</div>
        <input
          type="text"
          name="title"
          required
          maxLength={120}
          defaultValue={initial?.title ?? ""}
          placeholder="€10 voucher"
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="block md:col-span-2">
        <div className="text-[12px] text-ink">Description (optional)</div>
        <textarea
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={initial?.description ?? ""}
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="block">
        <div className="text-[12px] text-ink">Kind</div>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as LoyaltyRewardKind)}
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        >
          <option value="COUPON_FIXED">Discount — fixed amount (€)</option>
          <option value="COUPON_PERCENT">Discount — percent (%)</option>
          <option value="GIFT_CARD">Gift card</option>
          <option value="PRODUCT_FREE">Free product</option>
        </select>
      </label>

      <label className="block">
        <div className="text-[12px] text-ink">Points cost</div>
        <input
          type="number"
          name="pointsCost"
          min={1}
          required
          defaultValue={initial?.pointsCost ?? 1000}
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      {/* kind-specific fields */}
      {kind === "PRODUCT_FREE" ? (
        <label className="block md:col-span-2">
          <div className="text-[12px] text-ink">Product</div>
          <select
            name="productId"
            defaultValue={initial?.productId ?? ""}
            className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
          >
            <option value="">— pick a product —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {(kind === "GIFT_CARD" || kind === "COUPON_FIXED") ? (
        <label className="block">
          <div className="text-[12px] text-ink">Value (€)</div>
          <input
            type="number"
            name="valueEur"
            min={0}
            step="0.01"
            defaultValue={initialValueEur}
            placeholder="10.00"
            className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
          />
        </label>
      ) : null}

      {kind === "COUPON_PERCENT" ? (
        <label className="block">
          <div className="text-[12px] text-ink">Percent off (%)</div>
          <input
            type="number"
            name="percentOff"
            min={1}
            max={99}
            defaultValue={initial?.percentOff ?? 10}
            className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
          />
        </label>
      ) : null}

      <label className="block">
        <div className="text-[12px] text-ink">Sort order</div>
        <input
          type="number"
          name="sortOrder"
          min={0}
          defaultValue={initial?.sortOrder ?? 0}
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="block">
        <div className="text-[12px] text-ink">Icon key (optional)</div>
        <input
          type="text"
          name="iconKey"
          maxLength={40}
          defaultValue={initial?.iconKey ?? ""}
          placeholder="ticket"
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="md:col-span-2 inline-flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="h-4 w-4 border-ink/30 accent-vermilion"
        />
        Active — visible in customer drawer
      </label>

      <div className="md:col-span-2 flex items-center justify-between gap-4 pt-2">
        <div className="text-[12px]">
          {flash ? (
            <span className="text-sage">{flash}</span>
          ) : state.message && !state.ok ? (
            <span className="text-vermilion">{state.message}</span>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
        >
          {pending ? "Saving…" : initial?.id ? "Save reward" : "Add reward"}
        </button>
      </div>
    </form>
  );
}
