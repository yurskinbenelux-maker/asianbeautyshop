// ─────────────────────────────────────────────────────────────────────────
// Edit a customer's core profile: name, phone, locale, marketing opt-in.
// Uses useActionState for a one-shot toast row under the Save button.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Locale } from "@prisma/client";
import {
  updateCustomerProfileAction,
  type ActionState,
} from "@/app/admin/customers/actions";

const INITIAL: ActionState = { ok: false };

export function ProfileForm({
  userId,
  firstName,
  lastName,
  phone,
  preferredLocale,
  marketingOptIn,
}: {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  preferredLocale: Locale;
  marketingOptIn: boolean;
}) {
  const [state, action] = useActionState(updateCustomerProfileAction, INITIAL);
  const errs = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name" error={errs.firstName}>
          <input
            name="firstName"
            defaultValue={firstName ?? ""}
            className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
          />
        </Field>
        <Field label="Last name" error={errs.lastName}>
          <input
            name="lastName"
            defaultValue={lastName ?? ""}
            className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
          />
        </Field>
      </div>

      <Field label="Phone" error={errs.phone}>
        <input
          name="phone"
          defaultValue={phone ?? ""}
          className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
        />
      </Field>

      <Field label="Preferred locale">
        <select
          name="preferredLocale"
          defaultValue={preferredLocale}
          className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
        >
          {Object.values(Locale).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>

      <label className="inline-flex items-center gap-2 text-[12px] text-ink-mid">
        <input
          type="checkbox"
          name="marketingOptIn"
          defaultChecked={marketingOptIn}
          className="h-3.5 w-3.5 accent-ink"
        />
        Subscribed to the newsletter
      </label>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton>Save profile</SubmitButton>
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
