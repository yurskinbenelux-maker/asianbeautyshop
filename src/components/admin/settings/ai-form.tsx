"use client";

import { useActionState } from "react";
import {
  updateAiSettingsAction,
  type ActionState,
} from "@/app/admin/settings/actions";
import type { AiSettings } from "@/lib/settings";
import { Field, SaveBar, StatusBanner } from "./settings-chrome";

const INITIAL: ActionState = { ok: false };

export function AiForm({ initial }: { initial: AiSettings }) {
  const [state, action] = useActionState(updateAiSettingsAction, INITIAL);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="max-w-3xl space-y-6">
      <label className="flex items-start gap-2 text-[12px] text-ink">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={initial.enabled}
          className="mt-0.5 h-3.5 w-3.5 accent-ink"
        />
        <span>
          <span>Enable the floating AI skin assistant</span>
          <span className="mt-0.5 block text-[11px] text-ink-mid">
            When off, the orb disappears from the store and the /api/ai
            endpoint refuses requests.
          </span>
        </span>
      </label>

      <Field
        label="Assistant name"
        hint="Shown on the orb and in the chat header. Keep it short — 2 to 6 characters works best."
        error={err.assistantName?.[0]}
      >
        <input
          name="assistantName"
          defaultValue={initial.assistantName}
          className="input"
          required
          maxLength={40}
        />
      </Field>

      <Field
        label="System prompt"
        hint="The AI's personality and rules. This is prepended to every conversation — be specific about tone, allowed claims, and what to do when unsure."
        error={err.systemPrompt?.[0]}
      >
        <textarea
          name="systemPrompt"
          rows={14}
          defaultValue={initial.systemPrompt}
          className="input font-mono text-[12px] leading-relaxed"
          required
          maxLength={8000}
        />
      </Field>

      <Field
        label="Max response tokens"
        hint="Caps how long each AI reply can be. 600 is a comfortable default; raise for longer routines, lower for tighter responses. Set 0 to use the model's own limit."
        error={err.maxResponseTokens?.[0]}
      >
        <input
          name="maxResponseTokens"
          type="number"
          min="0"
          max="4000"
          step="50"
          defaultValue={initial.maxResponseTokens}
          className="input max-w-[12rem]"
          required
        />
      </Field>

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}
