// ─────────────────────────────────────────────────────────────────────────
// CancelOrderForm — dedicated cancel sub-form on /admin/orders/[id].
//
// Replaces the old generic "Move to Cancelled" button that was buried
// among the other status-transition buttons. That path captured no
// reason and triggered no refund — a problem for Belgian B2C law (Code
// de droit économique VI.83: refund within 14 days of cancellation is
// mandatory).
//
// This form:
//   · Dropdown of common reasons + "Custom" text input fallback
//   · For paid orders, a pre-checked "Issue full refund (€X)" checkbox
//     that fires the cancellation refund pipeline (Mollie refund + CN
//     + loyalty clawback + VAT YTD subtract)
//   · Two-step confirm — first click changes the button to "Confirm
//     cancel", second click submits. Stops accidental cancels.
//
// Server-side: cancelOrderAction handles the actual work. This component
// just collects intent.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cancelOrderAction, type ActionState } from "@/app/admin/orders/actions";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const COMMON_REASONS = [
  "Customer requested cancellation",
  "Item out of stock",
  "Address invalid / undeliverable",
  "Suspected fraud / chargeback risk",
  "Duplicate order",
  "Payment issue",
] as const;

type Props = {
  orderId: string;
  /** Grand total in EUR — shown next to the refund checkbox. */
  grandTotal: number;
  /** Shipping portion of grandTotal in EUR (VAT-inclusive). */
  shippingTotal: number;
  /** True when paymentStatus === PAID. Drives whether the refund
   *  toggle is shown + pre-checked. */
  isPaid: boolean;
  /** True when the parcel is already with the carrier OR a Sendcloud
   *  parcel was created (we'll be on the hook for shipping either way).
   *  When true, the "Refund shipping" sub-toggle defaults to OFF —
   *  admin can still override. */
  shippingAtRisk: boolean;
};

export function CancelOrderForm({
  orderId,
  grandTotal,
  shippingTotal,
  isPaid,
  shippingAtRisk,
}: Props) {
  const [reason, setReason] = useState<string>(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [issueRefund, setIssueRefund] = useState(isPaid);
  // Default for the shipping sub-toggle: refund shipping only when the
  // parcel isn't already on its way. Matches the policy "we refund what
  // we haven't already spent on the carrier".
  const [refundShipping, setRefundShipping] = useState(!shippingAtRisk);
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ActionState>({ ok: false });
  const [isPending, startTransition] = useTransition();

  const isCustom = reason === "__custom__";
  const finalReason = isCustom ? customReason.trim() : reason;

  // Live refund amount the admin will charge to Mollie. When shipping
  // is excluded, subtract the shipping portion from the grand total.
  const effectiveRefund = round2(
    grandTotal - (refundShipping ? 0 : shippingTotal),
  );

  function handleSubmit(formData: FormData) {
    setState({ ok: false });
    startTransition(async () => {
      const result = await cancelOrderAction({ ok: false }, formData);
      setState(result);
      if (result.ok) {
        setConfirming(false);
      }
    });
  }

  return (
    <div className="border border-vermilion/30 bg-vermilion/[0.03] p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-vermilion"
          aria-hidden
        />
        <div className="flex-1">
          <h3 className="text-[12px] uppercase tracking-label text-vermilion">
            Cancel order
          </h3>
          <p className="mt-1 text-[12px] text-ink-mid">
            Cancels this order, restocks the line items, and (for paid
            orders) issues a full Mollie refund with a matching credit
            note. Customer receives an email with the breakdown.
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="mt-4 space-y-3">
        <input type="hidden" name="orderId" value={orderId} />

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-label text-ink-mid">
            Reason
          </span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isPending}
            className="w-full border border-ink/20 bg-white px-2 py-1.5 text-[13px] text-ink focus:border-vermilion focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {COMMON_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="__custom__">Custom reason…</option>
          </select>
        </label>

        {isCustom && (
          <input
            type="text"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            disabled={isPending}
            placeholder="Type the reason…"
            maxLength={500}
            className="w-full border border-ink/20 bg-white px-2 py-1.5 text-[13px] text-ink focus:border-vermilion focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
        )}

        {/* The reason text is what the server action reads. We send the
            resolved value so the dropdown selection or custom string
            ends up in the audit log + customer email consistently. */}
        <input type="hidden" name="reason" value={finalReason} />

        {isPaid && (
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                name="issueRefund"
                value="yes"
                checked={issueRefund}
                onChange={(e) => setIssueRefund(e.target.checked)}
                disabled={isPending}
                className="mt-0.5 h-4 w-4 border-ink/30 text-vermilion focus:ring-vermilion disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span>
                Issue refund —{" "}
                <strong className="font-medium">
                  €{effectiveRefund.toFixed(2)}
                </strong>
                . Generates a credit note and emails the customer.
              </span>
            </label>

            {/* Shipping sub-toggle. Only relevant when:
             *   - admin is actually issuing a refund
             *   - there's a non-zero shipping cost on the order
             * Default state mirrors the policy: refund shipping unless
             * the parcel is already with the carrier (we'd be paying
             * for it either way). */}
            {issueRefund && shippingTotal > 0 && (
              <label className="ml-6 flex items-start gap-2 text-[11px] text-ink-mid">
                <input
                  type="checkbox"
                  name="refundShipping"
                  value="yes"
                  checked={refundShipping}
                  onChange={(e) => setRefundShipping(e.target.checked)}
                  disabled={isPending}
                  className="mt-0.5 h-3.5 w-3.5 border-ink/30 text-vermilion focus:ring-vermilion disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span>
                  Include shipping (€{shippingTotal.toFixed(2)}) in the
                  refund.{" "}
                  {shippingAtRisk ? (
                    <span className="text-vermilion">
                      Parcel already with carrier — usually leave
                      unchecked.
                    </span>
                  ) : (
                    <span>Parcel not shipped yet — safe to refund.</span>
                  )}
                </span>
              </label>
            )}
          </div>
        )}

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={isPending || (isCustom && customReason.trim().length === 0)}
            className="inline-flex items-center gap-2 border border-vermilion px-4 py-2 text-[11px] uppercase tracking-label text-vermilion transition-colors hover:bg-vermilion hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel order…
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 bg-vermilion px-4 py-2 text-[11px] uppercase tracking-label text-white transition-colors hover:bg-vermilion/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Cancelling…" : `Confirm cancel${isPaid && issueRefund ? " & refund" : ""}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="inline-flex items-center gap-2 border border-ink/20 px-4 py-2 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>
          </div>
        )}

        {state.message && (
          <p
            className={
              "inline-flex items-start gap-1.5 text-[12px] " +
              (state.ok ? "text-sage" : "text-vermilion")
            }
            role="status"
            aria-live="polite"
          >
            {state.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            )}
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
