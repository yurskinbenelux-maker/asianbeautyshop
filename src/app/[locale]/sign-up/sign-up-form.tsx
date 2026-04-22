// ─────────────────────────────────────────────────────────────────────────
// Customer sign-up form — name, email, password, marketing opt-in, T&Cs.
// After a successful submit we show a "check your inbox" panel instead
// of re-rendering the form (so users don't bounce and submit again).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { signUpAction, type SignUpState } from "./actions";

const INITIAL: SignUpState = { ok: false, message: "" };

export function SignUpForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(signUpAction, INITIAL);

  // Confirmation-email success — show the "check inbox" panel.
  if (state?.ok && state.awaitConfirm) {
    return (
      <div className="border border-ink/10 bg-white/60 p-6">
        <div className="eyebrow text-vermilion">
          {t("sign_up_check_inbox_title")}
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-ink">
          {t.rich("sign_up_check_inbox_body", {
            email: state.email ?? "",
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

      {/* ── name ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
            {t("field_first_name")}
          </span>
          <input
            type="text"
            name="firstName"
            required
            autoComplete="given-name"
            autoFocus
            className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
            {t("field_last_name")}
          </span>
          <input
            type="text"
            name="lastName"
            required
            autoComplete="family-name"
            className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
          />
        </label>
      </div>

      {/* ── email ─────────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_email")}
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
        />
      </label>

      {/* ── password ──────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_password")}
        </span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
        />
        <span className="mt-1 block text-[11px] text-ink-mid">
          {t("error_password_short")}
        </span>
      </label>

      {/* ── marketing opt-in ──────────────────────────────────── */}
      <label className="flex cursor-pointer items-start gap-3 text-[13px] text-ink">
        <input
          type="checkbox"
          name="marketingOptIn"
          className="mt-[3px] h-4 w-4 appearance-none border border-ink/30 bg-white checked:bg-vermilion focus:outline-none"
        />
        <span className="leading-relaxed">{t("field_marketing")}</span>
      </label>

      {/* ── terms (required) ──────────────────────────────────── */}
      <label className="flex cursor-pointer items-start gap-3 text-[13px] text-ink">
        <input
          type="checkbox"
          name="acceptsTerms"
          required
          className="mt-[3px] h-4 w-4 appearance-none border border-ink/30 bg-white checked:bg-vermilion focus:outline-none"
        />
        <span className="leading-relaxed">
          {t("field_terms_pre")}{" "}
          <Link
            href="/legal/terms"
            className="underline decoration-vermilion underline-offset-4 hover:text-vermilion"
          >
            {t("field_terms_link")}
          </Link>
          {t("field_terms_post")}
        </span>
      </label>

      {state && !state.ok && state.message && (
        <p role="alert" className="text-[12px] text-vermilion">
          {state.message}
        </p>
      )}

      <SubmitButton
        label={t("sign_up_cta")}
        pendingLabel={t("signing_up")}
      />
    </form>
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
      className="h-12 w-full bg-ink text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
