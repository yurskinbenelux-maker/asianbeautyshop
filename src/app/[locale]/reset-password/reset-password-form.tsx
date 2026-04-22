// ─────────────────────────────────────────────────────────────────────────
// Reset-password form — pick a new password.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { resetPasswordAction, type ResetState } from "./actions";

const INITIAL: ResetState = { ok: false, message: "" };

export function ResetPasswordForm({
  locale,
  hasSession,
}: {
  locale: string;
  hasSession: boolean;
}) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(resetPasswordAction, INITIAL);

  if (!hasSession) {
    return (
      <div className="border border-ink/10 bg-white/60 p-6">
        <p className="text-[14px] leading-relaxed text-ink">
          {t("reset_missing_session")}
        </p>
        <Link
          href="/forgot-password"
          className="mt-5 inline-block text-[11px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
        >
          {t("forgot_title")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

      <label className="block">
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_new_password")}
        </span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoFocus
          autoComplete="new-password"
          className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
        />
      </label>

      {state && !state.ok && state.message && (
        <p role="alert" className="text-[12px] text-vermilion">
          {state.message}
        </p>
      )}

      <SubmitButton label={t("reset_cta")} pendingLabel={t("signing_in")} />
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
