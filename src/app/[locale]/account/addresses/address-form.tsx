// ─────────────────────────────────────────────────────────────────────────
// AddressForm — shared between "add new" and "edit existing".
//
// Uses useActionState for progressive enhancement: works without JS,
// shows loading state + field-level errors with JS.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { createAddressAction, updateAddressAction } from "./actions";
import { INITIAL_ADDRESS_STATE, type ActionState } from "./form-state";

export type AddressFormDefaults = {
  id?: string;
  firstName?: string;
  lastName?: string;
  company?: string | null;
  line1?: string;
  line2?: string | null;
  city?: string;
  postcode?: string;
  region?: string | null;
  country?: string;
  phone?: string | null;
  isDefault?: boolean;
};

export function AddressForm({
  locale,
  defaults,
  mode,
}: {
  locale: string;
  defaults?: AddressFormDefaults;
  mode: "create" | "edit";
}) {
  const t = useTranslations("account");
  const action =
    mode === "edit" ? updateAddressAction : createAddressAction;
  const [state, formAction] = useActionState<ActionState, FormData>(
    action,
    INITIAL_ADDRESS_STATE,
  );

  const err = (k: string) => state?.fieldErrors?.[k];

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      {mode === "edit" && defaults?.id && (
        <input type="hidden" name="id" value={defaults.id} />
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={t("field_first_name")}
          name="firstName"
          defaultValue={defaults?.firstName ?? ""}
          required
          error={err("firstName")}
        />
        <Field
          label={t("field_last_name")}
          name="lastName"
          defaultValue={defaults?.lastName ?? ""}
          required
          error={err("lastName")}
        />
      </div>

      <Field
        label={t("field_company")}
        name="company"
        defaultValue={defaults?.company ?? ""}
        error={err("company")}
      />

      <Field
        label={t("field_line1")}
        name="line1"
        defaultValue={defaults?.line1 ?? ""}
        required
        error={err("line1")}
      />
      <Field
        label={t("field_line2")}
        name="line2"
        defaultValue={defaults?.line2 ?? ""}
        error={err("line2")}
      />

      <div className="grid gap-5 md:grid-cols-3">
        <Field
          label={t("field_postcode")}
          name="postcode"
          defaultValue={defaults?.postcode ?? ""}
          required
          error={err("postcode")}
        />
        <Field
          label={t("field_city")}
          name="city"
          defaultValue={defaults?.city ?? ""}
          required
          error={err("city")}
          className="md:col-span-2"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label={t("field_region")}
          name="region"
          defaultValue={defaults?.region ?? ""}
          error={err("region")}
        />
        <Field
          label={t("field_country")}
          name="country"
          defaultValue={defaults?.country ?? "BE"}
          required
          maxLength={2}
          error={err("country")}
          hint={t("field_country_hint")}
          uppercase
        />
      </div>

      <Field
        label={t("field_phone")}
        name="phone"
        defaultValue={defaults?.phone ?? ""}
        error={err("phone")}
        type="tel"
      />

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={defaults?.isDefault ?? false}
          className="mt-0.5 h-4 w-4 border-ink/20 accent-vermilion"
        />
        <span className="text-[13px] leading-relaxed text-ink">
          {t("field_is_default")}
        </span>
      </label>

      {state && !state.ok && state.message && !state.fieldErrors && (
        <p role="alert" className="text-[12px] text-vermilion">
          {t(`address_error.${state.message}` as AddressErrorKey)}
        </p>
      )}

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton
          label={
            mode === "edit" ? t("address_save_changes") : t("address_create")
          }
          pendingLabel={t("address_saving")}
        />
        <Link
          href="/account/addresses"
          className="text-[11px] uppercase tracking-label text-ink-mid underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
        >
          {t("address_cancel")}
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  required,
  error,
  className,
  type = "text",
  maxLength,
  hint,
  uppercase,
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
  error?: string;
  className?: string;
  type?: string;
  maxLength?: number;
  hint?: string;
  uppercase?: boolean;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
        {required && <span className="ml-1 text-vermilion">*</span>}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        className={[
          "w-full border bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:outline-none",
          error
            ? "border-vermilion focus:border-vermilion"
            : "border-ink/15 focus:border-ink",
          uppercase ? "uppercase tracking-wide" : "",
        ].join(" ")}
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

type AddressErrorKey =
  | "address_error.invalid"
  | "address_error.missing_id"
  | "address_error.not_found";
