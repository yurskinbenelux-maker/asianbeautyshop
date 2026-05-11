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
  /** True when paymentStatus === PAID. Drives whether the refund
   *  toggle is shown + pre-checked. */
  isPaid: boolean;
};

export function CancelOrderForm({ orderId, grandTotal, isPaid }: Props) {
  const [reason, setReason] = useState<string>(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [issueRefund, setIssueRefund] = useState(isPaid);
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ActionState>({ ok: false });
  const [isPending, startTransition] = useTransition();

  const isCustom = reason === "__custom__";
  const finalReason = isCustom ? customReason.trim() : reason;

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
              Issue full refund —{" "}
              <strong className="font-medium">
                €{grandTotal.toFixed(2)}
              </strong>{" "}
              incl. shipping. Generates a credit note and emails the
              customer.
            </span>
          </label>
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
