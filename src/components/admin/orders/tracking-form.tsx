// ─────────────────────────────────────────────────────────────────────────
// "Mark as shipped" / update tracking form.
//
// an admin fills in the carrier + tracking number (and optionally the public
// tracking URL) and submits. The server action flips the order to SHIPPED
// if it isn't already and logs an OrderEvent either way.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, Truck } from "lucide-react";
import {
  markShippedAction,
  type ActionState,
} from "@/app/admin/orders/actions";

const INITIAL: ActionState = { ok: false };

export function TrackingForm({
  orderId,
  carrier,
  trackingNumber,
  trackingUrl,
  alreadyShipped,
}: {
  orderId: string;
  carrier?: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  alreadyShipped: boolean;
}) {
  const [state, action] = useActionState(markShippedAction, INITIAL);
  const fieldErrs = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Carrier (optional)">
          <input
            name="carrier"
            defaultValue={carrier ?? ""}
            placeholder="PostNL, DHL, bpost…"
            className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
          />
        </Field>
        <Field label="Tracking number" error={fieldErrs.trackingNumber}>
          <input
            name="trackingNumber"
            defaultValue={trackingNumber ?? ""}
            required
            className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
          />
        </Field>
      </div>

      <Field label="Tracking URL (optional)" error={fieldErrs.trackingUrl}>
        <input
          type="url"
          name="trackingUrl"
          defaultValue={trackingUrl ?? ""}
          placeholder="https://…"
          className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
        />
      </Field>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton>
          <Truck className="h-3.5 w-3.5" />
          {alreadyShipped ? "Update tracking" : "Mark as shipped"}
        </SubmitButton>

        {state.message && (
          <span
            className={
              "inline-flex items-center gap-1.5 text-[12px] " +
              (state.ok ? "text-sage" : "text-vermilion")
            }
            role="status"
            aria-live="polite"
          >
            {state.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      {children}
      {error && error.length > 0 && (
        <span className="mt-1 block text-[11px] text-vermilion">
          {error[0]}
        </span>
      )}
    </label>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}
