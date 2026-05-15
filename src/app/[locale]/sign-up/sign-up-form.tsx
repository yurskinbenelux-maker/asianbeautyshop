// ─────────────────────────────────────────────────────────────────────────
// Customer sign-up form — name, email, password, marketing opt-in, T&Cs.
// After a successful submit we show a "check your inbox" panel instead
// of re-rendering the form (so users don't bounce and submit again).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { signUpAction, type SignUpState } from "./actions";
import { readStoredReferralCode } from "@/components/marketing/referral-capture";

const INITIAL: SignUpState = { ok: false, message: "" };

// Order matches the locale switcher in the nav (EN · NL · FR · RU) so
// customers see the same lineup throughout the site.
const LOCALE_OPTIONS = [
  { code: "en", label: "EN" },
  { code: "nl", label: "NL" },
  { code: "fr", label: "FR" },
  { code: "ru", label: "RU" },
] as const;

export function SignUpForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(signUpAction, INITIAL);

  // Pre-fill the referral code from (in priority order) the URL `?ref=`,
  // then localStorage. Both paths are functional/attribution and require
  // no GDPR consent — see ReferralCapture for the rationale. We hold it
  // in component state so the customer can edit / clear if they want to.
  const [referralCode, setReferralCode] = useState("");
  const filledOnce = useRef(false);
  useEffect(() => {
    if (filledOnce.current) return;
    filledOnce.current = true;
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("ref")?.trim().toUpperCase();
    if (fromUrl) {
      setReferralCode(fromUrl);
      return;
    }
    const fromStorage = readStoredReferralCode();
    if (fromStorage) setReferralCode(fromStorage);
  }, []);

  // Preferred email language — defaults to the URL locale the customer
  // is registering from, but overridable via the pills below. Saved to
  // User.preferredLocale on signup so every Resend-sent email
  // (order confirmation, shipped, abandoned cart, birthday, etc.)
  // automatically uses this value. Guests continue to fall back to
  // EN per the schema default.
  const [emailLocale, setEmailLocale] = useState(locale);

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
      {/* Preferred email language — controlled state mirrored into
          this hidden input so the existing server action picks it up
          unchanged. Defaults to the URL locale; the customer overrides
          via the pills below. */}
      <input type="hidden" name="locale" value={emailLocale} />

      {/* ── preferred email language pills ─────────────────────── */}
      <div>
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_email_language")}
        </span>
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label={t("field_email_language")}
        >
          {LOCALE_OPTIONS.map((opt) => {
            const isActive = emailLocale === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setEmailLocale(opt.code)}
                className={
                  isActive
                    ? "inline-flex h-9 min-w-[52px] items-center justify-center border border-ink bg-ink px-3 text-[12px] uppercase tracking-label text-rice"
                    : "inline-flex h-9 min-w-[52px] items-center justify-center border border-ink/15 bg-white/50 px-3 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink"
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
          {t("field_email_language_help")}
        </span>
      </div>

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

      {/* ── referral code (optional) ──────────────────────────── */}
      <label className="block">
        <span className="mb-2 block text-[11px] uppercase tracking-label text-ink-mid">
          {t("field_referral_code")}
        </span>
        <input
          type="text"
          name="referralCode"
          autoComplete="off"
          maxLength={32}
          value={referralCode}
          onChange={(e) =>
            setReferralCode(e.target.value.trim().toUpperCase())
          }
          placeholder="FRIEND-AB12"
          className="w-full border border-ink/15 bg-white/50 px-4 py-3 font-mono text-[13px] tracking-[0.12em] text-ink placeholder:text-ink-mid placeholder:font-sans focus:border-ink focus:outline-none"
        />
        <span className="mt-1 block text-[11px] text-ink-mid">
          {t("field_referral_help")}
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

      {/* OAuth alternative — same component used on /sign-in. New
          Google sign-ups skip the email-language picker on this form
          (default EN) and the first/last-name fields (Google provides
          them). The 10% welcome coupon still fires on first sign-in
          via the /auth/callback route + idempotent coupon helper. */}
      <GoogleSignInButton locale={locale} />
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
