"use client";

// ─────────────────────────────────────────────────────────────────────────
// Delete confirmation for a coupon.
//
// Two-step: click "Delete coupon" to reveal the DELETE-type-to-confirm
// prompt. We warn louder when the code has already been used because
// the FK is ON DELETE SET NULL — past orders' Order.couponCode column
// becomes NULL, so the "which code did this order use" linkage is lost.
// The discount amount (Order.discountTotal) survives, and the per-order
// audit timeline keeps its `coupon.applied` event, but the code-text
// itself is gone from the order row after deletion.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useState } from "react";
import {
  deleteCouponAction,
  type ActionState,
} from "@/app/admin/coupons/actions";
import { AlertTriangle } from "lucide-react";

const INITIAL: ActionState = { ok: false };

export function CouponDangerZone({
  code,
  redemptionsUsed,
}: {
  code: string;
  redemptionsUsed: number;
}) {
  const [state, dispatch] = useActionState(deleteCouponAction, INITIAL);
  const [open, setOpen] = useState(false);
  const err = state.fieldErrors ?? {};

  return (
    <section className="border border-vermilion/20 bg-vermilion/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-vermilion" />
        <div>
          <h2 className="font-display text-[18px] text-ink">Delete coupon</h2>
          <p className="mt-1 text-[12px] text-ink-mid">
            Removes the code from the catalogue. {redemptionsUsed > 0 ? (
              <span className="text-vermilion">
                {" "}This code has been redeemed {redemptionsUsed} time
                {redemptionsUsed === 1 ? "" : "s"}. Past orders keep their
                discount amount + audit timeline, but the code reference
                on those rows will be cleared. Best practice: set the
                coupon to inactive (uncheck the box above) if you want to
                preserve the link for reporting.
              </span>
            ) : (
              " Safe to remove — the code has never been redeemed."
            )}
          </p>

          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-4 inline-flex items-center gap-2 border border-vermilion bg-vermilion px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-vermilion/90"
            >
              Delete coupon
            </button>
          ) : (
            <form action={dispatch} className="mt-4 space-y-3">
              <input type="hidden" name="code" value={code} />
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                  Type DELETE to confirm
                </span>
                <input
                  name="confirm"
                  className="input max-w-xs font-mono tracking-label"
                  autoFocus
                />
                {err.confirm?.[0] && (
                  <span className="mt-1 block text-[11px] text-vermilion">
                    {err.confirm[0]}
                  </span>
                )}
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 border border-vermilion bg-vermilion px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-vermilion/90"
                >
                  Permanently delete
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 border border-ink/20 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
                >
                  Cancel
                </button>
              </div>
              {state.message && !state.ok && (
                <p className="text-[11px] text-vermilion">{state.message}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
