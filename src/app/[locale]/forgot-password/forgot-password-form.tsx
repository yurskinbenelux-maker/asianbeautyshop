// ─────────────────────────────────────────────────────────────────────────
// Forgot-password form — one email field + "send reset link".
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  sendResetLinkAction,
  type ForgotState,
} from "./actions";

const INITIAL: ForgotState = { ok: false, message: "" };

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(sendResetLinkAction, INITIAL);

  if (state?.ok) {
    return (
      <div className="border border-ink/10 bg-white/60 p-6">
        <div className="eyebrow text-vermilion">{t("forgot_sent_title")}</div>
        <p className="mt-3 text-[14px] leading-relaxed text-ink">
          {t.rich("forgot_sent_body", {
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

      <label className="block">
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_email")}
        </span>
        <input
          type="email"
          name="email"
          required
          autoFocus
          autoComplete="email"
          className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
        />
      </label>

      {state && !state.ok && state.message && (
        <p role="alert" className="text-[12px] text-vermilion">
          {state.message}
        </p>
      )}

      <SubmitButton label={t("forgot_cta")} pendingLabel={t("signing_in")} />
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
