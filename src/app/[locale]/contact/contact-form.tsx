// ─────────────────────────────────────────────────────────────────────────
// /[locale]/contact — client form.
//
// Uses useActionState so the server action's validation errors can render
// inline next to the fields. On success, swaps the form for a thank-you
// card that echoes the sender's name + email.
//
// Honeypot: the hidden `website` input is styled off-screen with a label
// reading "Leave this empty" for assistive-tech users. Real humans never
// type in it; bots that fill every field do, and the action silently
// drops the submission.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";

import { submitContactMessage, type ContactState } from "./actions";

const INITIAL: ContactState = { ok: false, message: "" };

type Defaults = { name: string; email: string };

export function ContactForm({
  locale,
  defaults,
}: {
  locale: string;
  defaults: Defaults;
}) {
  const t = useTranslations("contact");
  const [state, formAction] = useActionState(submitContactMessage, INITIAL);

  // Map the short error codes the server returns into localised copy.
  const errorText = useMemo(
    () =>
      ({
        name_too_short: t("error_name_too_short"),
        name_too_long: t("error_name_too_long"),
        email_invalid: t("error_email_invalid"),
        phone_too_long: t("error_phone_too_long"),
        message_too_short: t("error_message_too_short"),
        message_too_long: t("error_message_too_long"),
        consent_required: t("error_consent_required"),
        validation_failed: t("error_generic"),
      }) as const,
    [t],
  );

  if (state?.ok && state.message === "success") {
    return (
      <div className="border border-ink/10 bg-white/60 p-8">
        <div className="flex items-center gap-2 text-vermilion">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          <span className="eyebrow text-vermilion">{t("sent_title")}</span>
        </div>
        <h2 className="mt-3 font-display text-display-sm text-ink">
          {t.rich("sent_headline", {
            name: state.echo?.name ?? "",
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </h2>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-mid">
          {t.rich("sent_body", {
            email: state.echo?.email ?? "",
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    );
  }

  const fe = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* smuggled context */}
      <input type="hidden" name="locale" value={locale} />

      {/* honeypot — off-screen but focusable so screen-readers can skip it */}
      <div aria-hidden className="pointer-events-none absolute -left-[9999px]">
        <label>
          Leave this empty
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>

      {/* Name + email side-by-side on md+ */}
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          name="name"
          label={t("field_name")}
          defaultValue={defaults.name}
          required
          autoComplete="name"
          error={fe.name ? errorText[fe.name as keyof typeof errorText] : undefined}
        />
        <Field
          name="email"
          type="email"
          label={t("field_email")}
          defaultValue={defaults.email}
          required
          autoComplete="email"
          error={fe.email ? errorText[fe.email as keyof typeof errorText] : undefined}
        />
      </div>

      <Field
        name="phone"
        type="tel"
        label={t("field_phone_optional")}
        autoComplete="tel"
      />

      {/* Subject select — controls which admin team eventually handles it */}
      <label className="block">
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_subject")}
        </span>
        <select
          name="subject"
          defaultValue="GENERAL"
          className="h-12 w-full border border-ink/15 bg-white/50 px-4 text-[14px] text-ink focus:border-ink focus:outline-none"
        >
          <option value="GENERAL">{t("subject_general")}</option>
          <option value="ORDER">{t("subject_order")}</option>
          <option value="RETURN">{t("subject_return")}</option>
          <option value="WHOLESALE">{t("subject_wholesale")}</option>
          <option value="TECHNICAL">{t("subject_technical")}</option>
        </select>
      </label>

      <Field
        name="orderNumber"
        label={t("field_order_optional")}
        placeholder="YUR-20260422-0001"
      />

      {/* Message textarea */}
      <label className="block">
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_message")}
        </span>
        <textarea
          name="message"
          required
          rows={7}
          minLength={10}
          maxLength={4000}
          className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] leading-relaxed text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
          placeholder={t("message_placeholder")}
        />
        {fe.message && (
          <span role="alert" className="mt-1 block text-[12px] text-vermilion">
            {errorText[fe.message as keyof typeof errorText] ?? errorText.validation_failed}
          </span>
        )}
      </label>

      {/* Consent checkbox — required by GDPR before we can store this */}
      <label className="flex items-start gap-3 text-[13px] leading-relaxed text-ink-mid">
        <input
          type="checkbox"
          name="consent"
          value="on"
          required
          className="mt-1 h-4 w-4 border-ink/30 text-ink focus:ring-ink"
        />
        <span>
          {t.rich("consent_label", {
            link: (chunks) => (
              <a
                href={`/${locale}/legal/privacy`}
                className="underline decoration-vermilion underline-offset-4 hover:text-vermilion"
              >
                {chunks}
              </a>
            ),
          })}
        </span>
      </label>

      {!state?.ok && state?.message && state.message !== "" && (
        <p role="alert" className="text-[12px] text-vermilion">
          {errorText[state.message as keyof typeof errorText] ?? errorText.validation_failed}
        </p>
      )}

      <SubmitButton label={t("cta_send")} pendingLabel={t("cta_sending")} />
    </form>
  );
}

// ────────── small presentational helpers ──────────────────────────────

function Field({
  name,
  label,
  error,
  type = "text",
  required,
  defaultValue,
  autoComplete,
  placeholder,
}: {
  name: string;
  label: string;
  error?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="h-12 w-full border border-ink/15 bg-white/50 px-4 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
      />
      {error && (
        <span role="alert" className="mt-1 block text-[12px] text-vermilion">
          {error}
        </span>
      )}
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
      className="h-12 w-full bg-ink text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion disabled:cursor-wait disabled:opacity-60 md:w-auto md:min-w-[220px] md:px-10"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
