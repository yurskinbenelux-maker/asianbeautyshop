// ─────────────────────────────────────────────────────────────────────────
// Refund form — full or partial. Logs the intent; actual Mollie refund
// happens in a separate webhook path (future work). The "external"
// checkbox is for when Sofia has already moved money by hand (bank
// transfer, shop credit, etc.) and just needs to keep the record tidy.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  issueRefundAction,
  type ActionState,
} from "@/app/admin/orders/actions";

const INITIAL: ActionState = { ok: false };

export function RefundForm({
  orderId,
  grandTotal,
  currency,
}: {
  orderId: string;
  grandTotal: number;
  currency: string;
}) {
  const [kind, setKind] = useState<"full" | "partial">("full");
  const [state, action] = useActionState(issueRefundAction, INITIAL);
  const fieldErrs = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />

      <fieldset>
        <legend className="mb-1.5 text-[11px] uppercase tracking-label text-ink-mid">
          Refund type
        </legend>
        <div className="flex gap-2">
          <RadioChip
            name="kind"
            value="full"
            checked={kind === "full"}
            onChange={() => setKind("full")}
            label={`Full · ${formatMoney(grandTotal, currency)}`}
          />
          <RadioChip
            name="kind"
            value="partial"
            checked={kind === "partial"}
            onChange={() => setKind("partial")}
            label="Partial"
          />
        </div>
      </fieldset>

      {kind === "partial" && (
        <Field label={`Amount (${currency})`} error={fieldErrs.amount}>
          <input
            name="amount"
            inputMode="decimal"
            placeholder="e.g. 12.50"
            className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
          />
        </Field>
      )}

      <Field label="Reason (optional)">
        <textarea
          name="reason"
          rows={2}
          maxLength={500}
          placeholder="Damaged in transit, customer request, …"
          className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
        />
      </Field>

      <label className="inline-flex items-center gap-2 text-[12px] text-ink-mid">
        <input
          type="checkbox"
          name="external"
          className="h-3.5 w-3.5 accent-ink"
        />
        Money already returned externally (bank transfer, credit note)
      </label>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton>Issue refund</SubmitButton>
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

function RadioChip({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className={
        "cursor-pointer border px-3 py-1.5 text-[11px] uppercase tracking-label transition-colors " +
        (checked
          ? "border-ink bg-ink text-white"
          : "border-ink/15 text-ink-mid hover:border-ink hover:text-ink")
      }
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {label}
    </label>
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
      className="inline-flex items-center gap-2 border border-vermilion/70 px-4 py-2 text-[11px] uppercase tracking-label text-vermilion hover:bg-vermilion hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}

function formatMoney(n: number, currency: string) {
  const symbol = currency === "EUR" ? "€" : currency;
  return `${symbol} ${n.toFixed(2)}`;
}
