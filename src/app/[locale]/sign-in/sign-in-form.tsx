// ─────────────────────────────────────────────────────────────────────────
// Customer sign-in form — email + password with inline validation.
// Success redirects are handled server-side by the action.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import {
  signInWithPasswordAction,
  type SignInState,
} from "./actions";

const INITIAL: SignInState = { ok: false, message: "" };

export function SignInForm({
  locale,
  next,
}: {
  locale: string;
  next: string;
}) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(
    signInWithPasswordAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />

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
          autoFocus
          className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
        />
      </label>

      {/* ── password ──────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-2 flex items-baseline justify-between text-[11px] uppercase tracking-label text-ink-mid">
          <span>{t("field_password")}</span>
          <Link
            href="/forgot-password"
            className="text-[11px] normal-case tracking-normal text-ink-mid underline decoration-vermilion underline-offset-4 hover:text-vermilion"
          >
            {t("forgot_password")}
          </Link>
        </span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full border border-ink/15 bg-white/50 px-4 py-3 text-[14px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
        />
      </label>

      {state && !state.ok && state.message && (
        <p role="alert" className="text-[12px] text-vermilion">
          {state.message}
        </p>
      )}

      <SubmitButton label={t("sign_in_cta")} pendingLabel={t("signing_in")} />
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
