"use client";

import { useActionState } from "react";
import {
  updateShippingSettingsAction,
  type ActionState,
} from "@/app/admin/settings/actions";
import type { ShippingSettings } from "@/lib/settings";
import { Field, SaveBar, StatusBanner } from "./settings-chrome";

const INITIAL: ActionState = { ok: false };

export function ShippingForm({ initial }: { initial: ShippingSettings }) {
  const [state, action] = useActionState(
    updateShippingSettingsAction,
    INITIAL,
  );
  const err = state.fieldErrors ?? {};

  // Cents → euros for the form; the action converts back.
  const freeThresholdEuros = (initial.freeThresholdCents / 100).toFixed(2);
  const flatRateEuros = (initial.flatRateCents / 100).toFixed(2);

  return (
    <form action={action} className="max-w-2xl space-y-6">
      <Field
        label="Flat shipping rate (€)"
        hint="Charged on every order below the free-shipping threshold. Set to 0 for always-free shipping."
        error={err.flatRateEuros?.[0]}
      >
        <input
          name="flatRateEuros"
          type="number"
          step="0.01"
          min="0"
          defaultValue={flatRateEuros}
          className="input"
          required
        />
      </Field>

      <Field
        label="Free shipping threshold (€)"
        hint="Orders at or above this subtotal ship for free. Set to 0 to disable the free-over offer."
        error={err.freeThresholdEuros?.[0]}
      >
        <input
          name="freeThresholdEuros"
          type="number"
          step="0.01"
          min="0"
          defaultValue={freeThresholdEuros}
          className="input"
          required
        />
      </Field>

      <Field
        label="Ship to countries"
        hint="Comma-separated ISO country codes (e.g. BE, NL, FR). Leave blank to allow every country."
        error={err.allowedCountriesRaw?.[0]}
      >
        <input
          name="allowedCountriesRaw"
          defaultValue={initial.allowedCountries.join(", ")}
          className="input font-mono uppercase tracking-label"
          placeholder="BE, NL, FR"
        />
      </Field>

      <Field
        label="Shipping disclaimer"
        hint="Shown on the cart drawer and on the /shipping info page."
        error={err.disclaimer?.[0]}
      >
        <textarea
          name="disclaimer"
          rows={4}
          defaultValue={initial.disclaimer}
          className="input"
          maxLength={800}
        />
      </Field>

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}
