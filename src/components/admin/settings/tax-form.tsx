"use client";

import { useActionState } from "react";
import {
  updateTaxSettingsAction,
  type ActionState,
} from "@/app/admin/settings/actions";
import type { TaxSettings } from "@/lib/settings";
import { Field, SaveBar, StatusBanner } from "./settings-chrome";

const INITIAL: ActionState = { ok: false };

export function TaxForm({ initial }: { initial: TaxSettings }) {
  const [state, action] = useActionState(updateTaxSettingsAction, INITIAL);
  const err = state.fieldErrors ?? {};

  // The overrides map is rendered as a "CC:rate" list — one per line.
  const overridesText = Object.entries(initial.overrides)
    .map(([code, rate]) => `${code}:${rate}`)
    .join("\n");

  return (
    <form action={action} className="max-w-2xl space-y-6">
      <Field
        label="Default VAT rate (%)"
        hint="Used on every order that doesn't match a country-specific override."
        error={err.ratePercent?.[0]}
      >
        <input
          name="ratePercent"
          type="number"
          step="0.1"
          min="0"
          max="100"
          defaultValue={initial.ratePercent}
          className="input"
          required
        />
      </Field>

      <label className="flex items-start gap-2 text-[12px] text-ink">
        <input
          type="checkbox"
          name="includedInPrice"
          defaultChecked={initial.includedInPrice}
          className="mt-0.5 h-3.5 w-3.5 accent-ink"
        />
        <span>
          <span>Prices shown to customers include VAT</span>
          <span className="mt-0.5 block text-[11px] text-ink-mid">
            Recommended for EU retail. When off, VAT is added at checkout and
            shown as a separate line.
          </span>
        </span>
      </label>

      <Field
        label="Country overrides (optional)"
        hint="One entry per line, format: COUNTRY_CODE:rate — e.g. NL:21, FR:20, RU:0"
        error={err.overridesRaw?.[0]}
      >
        <textarea
          name="overridesRaw"
          rows={4}
          defaultValue={overridesText}
          className="input font-mono text-[12px] uppercase"
          placeholder="NL:21&#10;FR:20"
        />
      </Field>

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}
