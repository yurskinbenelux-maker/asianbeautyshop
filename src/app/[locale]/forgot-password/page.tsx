// ─────────────────────────────────────────────────────────────────────────
// /[locale]/forgot-password — request a reset link.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { ForgotPasswordForm } from "./forgot-password-form";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    title: t("forgot_title"),
    robots: { index: false, follow: false },
  };
}

export default async function ForgotPasswordPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <section className="container flex justify-center py-16 md:py-24">
      <div className="w-full max-w-sm">
        <div className="eyebrow">{t("forgot_title")}</div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {t("forgot_title")}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-mid">
          {t("forgot_lede")}
        </p>

        <div className="mt-10">
          <ForgotPasswordForm locale={locale} />
        </div>

        <p className="mt-10 text-[13px] text-ink-mid">
          <Link
            href="/sign-in"
            className="text-ink underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
          >
            {t("forgot_back_to_sign_in")}
          </Link>
        </p>
      </div>
    </section>
  );
}
