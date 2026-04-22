// ─────────────────────────────────────────────────────────────────────────
// ProfileForm + PasswordForm — edit personal info and change password.
// Two separate forms so each has its own pending/error/success state.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  updateProfileAction,
  updatePasswordAction,
  INITIAL_PROFILE_STATE,
  type ActionState,
} from "./actions";

type ProfileDefaults = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  preferredLocale: "en" | "nl" | "fr" | "ru";
  marketingOptIn: boolean;
};

// ─────────────────────── profile (name / phone / locale) ─────────────────
export function ProfileForm({
  locale,
  defaults,
}: {
  locale: string;
  defaults: ProfileDefaults;
}) {
  const t = useTranslations("account");
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateProfileAction,
    INITIAL_PROFILE_STATE,
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />

      {/* email (read-only) */}
      <div>
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_email")}
        </span>
        <div className="border border-ink/10 bg-rice/40 px-4 py-3 text-[14px] text-ink">
          {defaults.email}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-mid">
          {t("profile_email_hint")}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={t("field_first_name")}
          name="firstName"
          defaultValue={defaults.firstName}
          error={state.fieldErrors?.firstName}
        />
        <Field
          label={t("field_last_name")}
          name="lastName"
          defaultValue={defaults.lastName}
          error={state.fieldErrors?.lastName}
        />
      </div>

      <Field
        label={t("field_phone")}
        name="phone"
        type="tel"
        defaultValue={defaults.phone}
        error={state.fieldErrors?.phone}
      />

      <fieldset>
        <legend className="mb-3 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_preferred_locale")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {(["en", "nl", "fr", "ru"] as const).map((code) => (
            <label
              key={code}
              className="inline-flex cursor-pointer items-center gap-2 border border-ink/15 bg-white/50 px-4 py-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-rice"
            >
              <input
                type="radio"
                name="preferredLocale"
                value={code}
                defaultChecked={defaults.preferredLocale === code}
                className="sr-only"
              />
              {code}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="marketingOptIn"
          defaultChecked={defaults.marketingOptIn}
          className="mt-0.5 h-4 w-4 border-ink/20 accent-vermilion"
        />
        <span className="text-[13px] leading-relaxed text-ink">
          {t("field_marketing")}
        </span>
      </label>

      <FormFeedback state={state} tPrefix="profile_msg" />

      <SubmitButton
        label={t("profile_save")}
        pendingLabel={t("profile_saving")}
      />
    </form>
  );
}

// ──────────────────────────────── password ───────────────────────────────
export function PasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("account");
  const [state, formAction] = useActionState<ActionState, FormData>(
    updatePasswordAction,
    INITIAL_PROFILE_STATE,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

      <Field
        label={t("field_current_password")}
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        error={errMsg(t, state.fieldErrors?.currentPassword)}
      />
      <Field
        label={t("field_new_password")}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        hint={t("password_hint_min")}
        error={errMsg(t, state.fieldErrors?.newPassword)}
      />
      <Field
        label={t("field_confirm_password")}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={errMsg(t, state.fieldErrors?.confirmPassword)}
      />

      <FormFeedback state={state} tPrefix="password_msg" />

      <SubmitButton
        label={t("password_save")}
        pendingLabel={t("password_saving")}
      />
    </form>
  );
}

// ────────────────────────────── helpers ──────────────────────────────────
function errMsg(
  t: ReturnType<typeof useTranslations>,
  key: string | undefined,
): string | undefined {
  if (!key) return undefined;
  return t(`field_error.${key}` as FieldErrorKey);
}

function FormFeedback({
  state,
  tPrefix,
}: {
  state: ActionState;
  tPrefix: "profile_msg" | "password_msg";
}) {
  const t = useTranslations("account");
  if (!state.message) return null;
  const isOk = state.ok;

  // Skip field-error message — handled in-field.
  if (!isOk && state.message === "invalid") return null;

  return (
    <p
      role="alert"
      className={`text-[12px] ${isOk ? "text-emerald-700" : "text-vermilion"}`}
    >
      {t(`${tPrefix}.${state.message}` as MsgKey)}
    </p>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  hint,
  error,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  hint?: string;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        className={`w-full border bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:outline-none ${
          error
            ? "border-vermilion focus:border-vermilion"
            : "border-ink/15 focus:border-ink"
        }`}
      />
      {error ? (
        <span className="mt-1.5 block text-[11px] text-vermilion">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-[11px] text-ink-mid">{hint}</span>
      ) : null}
    </label>
  );
}

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 bg-ink px-6 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

type FieldErrorKey =
  | "field_error.required"
  | "field_error.too_short"
  | "field_error.mismatch"
  | "field_error.wrong";

type MsgKey =
  | "profile_msg.saved"
  | "profile_msg.invalid"
  | "password_msg.password_saved"
  | "password_msg.current_wrong"
  | "password_msg.update_failed"
  | "password_msg.invalid";
