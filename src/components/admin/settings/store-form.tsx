"use client";

import { useActionState } from "react";
import {
  updateStoreSettingsAction,
  type ActionState,
} from "@/app/admin/settings/actions";
import type { StoreSettings } from "@/lib/settings";
import { Field, SaveBar, StatusBanner } from "./settings-chrome";

const INITIAL: ActionState = { ok: false };

export function StoreForm({ initial }: { initial: StoreSettings }) {
  const [state, action] = useActionState(updateStoreSettingsAction, INITIAL);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="max-w-2xl space-y-6">
      <Field label="Store name" error={err.name?.[0]}>
        <input
          name="name"
          defaultValue={initial.name}
          className="input"
          required
          maxLength={120}
        />
      </Field>

      <Field
        label="Support email"
        hint="Shown on /contact and in transactional emails."
        error={err.supportEmail?.[0]}
      >
        <input
          name="supportEmail"
          type="email"
          defaultValue={initial.supportEmail}
          className="input"
          placeholder="hello@yurskinsolution.eu"
        />
      </Field>

      <Field
        label="Support phone"
        hint="Optional. Leave blank if you prefer email-only support."
        error={err.supportPhone?.[0]}
      >
        <input
          name="supportPhone"
          defaultValue={initial.supportPhone}
          className="input"
          placeholder="+32 …"
        />
      </Field>

      <Field
        label="Email sign-off"
        hint="Closing line for order confirmation and shipping emails."
        error={err.signOff?.[0]}
      >
        <textarea
          name="signOff"
          rows={3}
          defaultValue={initial.signOff}
          className="input"
        />
      </Field>

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}
