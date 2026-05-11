// ─────────────────────────────────────────────────────────────────────────
// ReturnAdjudicationForm — per-item refund control for /admin/returns/[id].
//
// Replaces the old single "Refund amount" input. For each line in the
// return, admin decides:
//   · Accept the return AND refund the customer at this EUR amount
//     (default = line total, editable)
//   · Reject the line entirely — toggle, then pick / type a reason
//     ("Item missing", "Opened and used", "Damaged on receipt", etc.)
//     The reason surfaces in the customer's "return received" email so
//     the language they get matches reality.
//
// Gift card rows are auto-disabled and locked at €0 + reason
// "Non-refundable gift card" — both per EU Dir 2016/1065 MPV rules and
// our gift card PDP policy. The disabled-state is purely UX; the server
// action enforces it independently so a hand-crafted POST can't bypass.
//
// Bottom of the form shows a live running total. The total replaces the
// old single "refund amount" field, and the existing "Mark received &
// refund" transition still gates on > 0.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useMemo, useState } from "react";
import { CircleSlash, Lock, RotateCcw } from "lucide-react";
import { updateReturnAdjudicationAction } from "@/app/admin/returns/[id]/actions";

type Item = {
  id: string;
  nameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  lineTotal: number;
  acceptedRefundEur: number | null;
  rejectionReason: string | null;
  productKind: "STANDARD" | "GIFT_CARD";
};

type ItemState = {
  accept: boolean;
  amount: string;
  reason: string;
};

const COMMON_REJECTION_REASONS = [
  "Item missing from parcel",
  "Opened and used",
  "Damaged on receipt",
  "Past return window",
  "Wrong item returned",
] as const;

export function ReturnAdjudicationForm({
  returnId,
  items,
  disabled = false,
}: {
  returnId: string;
  items: Item[];
  /** True once the return has moved past APPROVED — adjudication is
   *  locked, the form renders read-only. */
  disabled?: boolean;
}) {
  // Seed state from existing per-item amounts (set on a previous save)
  // or defaults: STANDARD → accepted at line total, GIFT_CARD → rejected.
  const [state, setState] = useState<Record<string, ItemState>>(() => {
    const seed: Record<string, ItemState> = {};
    for (const it of items) {
      if (it.productKind === "GIFT_CARD") {
        seed[it.id] = {
          accept: false,
          amount: "0",
          reason:
            it.rejectionReason && it.rejectionReason.length > 0
              ? it.rejectionReason
              : "Non-refundable gift card",
        };
        continue;
      }
      // STANDARD line — preserve a previously-saved decision if there is
      // one, otherwise default to accept-at-line-total.
      const adjudicated = it.acceptedRefundEur !== null;
      const rejected = adjudicated && it.acceptedRefundEur === 0;
      seed[it.id] = {
        accept: !rejected,
        amount: rejected
          ? "0"
          : (it.acceptedRefundEur ?? it.lineTotal).toFixed(2),
        reason: it.rejectionReason ?? "",
      };
    }
    return seed;
  });

  const total = useMemo(() => {
    return items.reduce((sum, it) => {
      const s = state[it.id];
      if (!s || !s.accept || it.productKind === "GIFT_CARD") return sum;
      const n = Number.parseFloat(s.amount.replace(",", "."));
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
  }, [items, state]);

  function update(itemId: string, patch: Partial<ItemState>) {
    setState((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
  }

  return (
    <form action={updateReturnAdjudicationAction} className="space-y-4">
      <input type="hidden" name="returnId" value={returnId} />

      <div className="border border-ink/10 bg-white">
        {items.map((it, i) => {
          const s = state[it.id];
          const isGift = it.productKind === "GIFT_CARD";
          const rejected = !s.accept;

          return (
            <div
              key={it.id}
              className={
                "grid gap-4 border-b border-ink/10 p-4 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-start " +
                (rejected ? "bg-ink/[0.02]" : "bg-white")
              }
            >
              {/* Hidden submit fields — read by the server action. The
               *  visible UI is React state, the hidden inputs serialise
               *  state into FormData on submit. */}
              <input
                type="hidden"
                name={`item.${it.id}.accept`}
                value={s.accept ? "yes" : "no"}
              />
              <input
                type="hidden"
                name={`item.${it.id}.amount`}
                value={s.amount}
              />
              <input
                type="hidden"
                name={`item.${it.id}.reason`}
                value={s.reason}
              />

              {/* Left: item identity */}
              <div className="min-w-0">
                <div className="text-[14px] text-ink">
                  {it.nameSnapshot}
                  {isGift ? (
                    <span className="ml-2 inline-flex items-center gap-1 border border-gold/40 bg-gold/5 px-1.5 py-0.5 text-[9px] uppercase tracking-label text-gold">
                      <Lock className="h-2.5 w-2.5" aria-hidden />
                      Non-refundable
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-ink-mid">
                  {it.skuSnapshot} · × {it.quantity} · line total €
                  {it.lineTotal.toFixed(2)}
                </div>
              </div>

              {/* Middle: accept / reject toggle. Disabled for gift
               *  cards (always rejected) and after the return has
               *  passed the APPROVED status. */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => update(it.id, { accept: true })}
                  disabled={isGift || disabled}
                  className={
                    "border px-3 py-1.5 text-[11px] uppercase tracking-label transition-colors " +
                    (s.accept && !isGift
                      ? "border-ink bg-ink text-rice"
                      : "border-ink/20 bg-white text-ink-mid hover:border-ink hover:text-ink") +
                    (isGift || disabled ? " cursor-not-allowed opacity-50" : "")
                  }
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => update(it.id, { accept: false })}
                  disabled={isGift || disabled}
                  className={
                    "border px-3 py-1.5 text-[11px] uppercase tracking-label transition-colors " +
                    (!s.accept || isGift
                      ? "border-vermilion bg-vermilion text-rice"
                      : "border-ink/20 bg-white text-ink-mid hover:border-vermilion hover:text-vermilion") +
                    (isGift || disabled ? " cursor-not-allowed opacity-50" : "")
                  }
                >
                  Reject
                </button>
              </div>

              {/* Right: amount OR reason, depending on accept state */}
              <div className="md:w-[200px]">
                {s.accept && !isGift ? (
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-label text-ink-mid">
                      Refund (€)
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={it.lineTotal}
                        value={s.amount}
                        onChange={(e) =>
                          update(it.id, { amount: e.target.value })
                        }
                        disabled={disabled}
                        className="w-full border border-ink/20 bg-white px-2 py-1.5 text-[13px] text-ink focus:border-vermilion focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      {Number(s.amount) !== it.lineTotal && !disabled ? (
                        <button
                          type="button"
                          title="Reset to line total"
                          onClick={() =>
                            update(it.id, { amount: it.lineTotal.toFixed(2) })
                          }
                          className="text-ink-mid hover:text-ink"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </label>
                ) : (
                  <label className="block">
                    <span className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-label text-vermilion">
                      <CircleSlash className="h-2.5 w-2.5" aria-hidden />
                      Reason for rejection
                    </span>
                    {isGift ? (
                      <input
                        type="text"
                        value="Non-refundable gift card"
                        disabled
                        className="w-full cursor-not-allowed border border-ink/20 bg-ink/[0.03] px-2 py-1.5 text-[12px] text-ink-mid"
                      />
                    ) : (
                      <>
                        <select
                          value={
                            COMMON_REJECTION_REASONS.includes(
                              s.reason as (typeof COMMON_REJECTION_REASONS)[number],
                            )
                              ? s.reason
                              : "__custom__"
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            update(it.id, {
                              reason:
                                v === "__custom__"
                                  ? COMMON_REJECTION_REASONS.includes(
                                      s.reason as (typeof COMMON_REJECTION_REASONS)[number],
                                    )
                                    ? ""
                                    : s.reason
                                  : v,
                            });
                          }}
                          disabled={disabled}
                          className="w-full border border-ink/20 bg-white px-2 py-1.5 text-[12px] text-ink focus:border-vermilion focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {COMMON_REJECTION_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                          <option value="__custom__">Custom reason…</option>
                        </select>
                        {!COMMON_REJECTION_REASONS.includes(
                          s.reason as (typeof COMMON_REJECTION_REASONS)[number],
                        ) ? (
                          <input
                            type="text"
                            value={s.reason}
                            onChange={(e) =>
                              update(it.id, { reason: e.target.value })
                            }
                            disabled={disabled}
                            placeholder="Type custom reason…"
                            maxLength={120}
                            className="mt-1 w-full border border-ink/20 bg-white px-2 py-1.5 text-[12px] text-ink focus:border-vermilion focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        ) : null}
                      </>
                    )}
                  </label>
                )}
              </div>
            </div>
          );
        })}

        {/* Total strip */}
        <div className="flex items-baseline justify-between border-t-2 border-ink bg-ink/[0.02] px-4 py-3">
          <span className="text-[11px] uppercase tracking-label text-ink-mid">
            Total to refund
          </span>
          <span className="font-display text-[20px] text-ink">
            €{total.toFixed(2)}
          </span>
        </div>
      </div>

      {!disabled ? (
        <button
          type="submit"
          className="inline-flex items-center gap-2 border border-ink bg-white px-4 py-2 text-[11px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-rice"
        >
          Save adjudication
        </button>
      ) : null}
    </form>
  );
}
