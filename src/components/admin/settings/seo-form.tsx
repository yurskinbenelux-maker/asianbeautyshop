"use client";

import { useActionState } from "react";
import {
  updateSeoSettingsAction,
  type ActionState,
} from "@/app/admin/settings/actions";
import type { SeoSettings } from "@/lib/settings";
import { Field, SaveBar, StatusBanner } from "./settings-chrome";

const INITIAL: ActionState = { ok: false };

export function SeoForm({ initial }: { initial: SeoSettings }) {
  const [state, action] = useActionState(updateSeoSettingsAction, INITIAL);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="max-w-2xl space-y-6">
      <Field
        label="Default page title"
        hint="Used on pages without their own title. Keep it under ~60 characters so Google doesn't truncate it."
        error={err.defaultTitle?.[0]}
      >
        <input
          name="defaultTitle"
          defaultValue={initial.defaultTitle}
          className="input"
          required
          maxLength={180}
        />
      </Field>

      <Field
        label="Default meta description"
        hint="Shown under the title in search results. Aim for 140–160 characters."
        error={err.defaultDescription?.[0]}
      >
        <textarea
          name="defaultDescription"
          rows={3}
          defaultValue={initial.defaultDescription}
          className="input"
          required
          maxLength={400}
        />
      </Field>

      <Field
        label="OpenGraph image URL"
        hint="Absolute https:// URL to the image shown when the site is shared on WhatsApp, Messenger, Slack, etc. Leave blank to fall back to the hero."
        error={err.ogImageUrl?.[0]}
      >
        <input
          name="ogImageUrl"
          type="url"
          defaultValue={initial.ogImageUrl}
          className="input"
          placeholder="https://…/og.jpg"
        />
      </Field>

      <Field
        label="robots.txt"
        hint="Served from /robots.txt. The default blocks admin and allows everything else."
        error={err.robotsTxt?.[0]}
      >
        <textarea
          name="robotsTxt"
          rows={5}
          defaultValue={initial.robotsTxt}
          className="input font-mono text-[12px]"
          maxLength={2000}
        />
      </Field>

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}
