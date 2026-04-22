// ─────────────────────────────────────────────────────────────────────────
// /[locale]/reset-password — user lands here after clicking the reset
// link. If they have a valid session, they get the "choose new password"
// form; otherwise they're told the link expired.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { ResetPasswordForm } from "./reset-password-form";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    title: t("reset_title"),
    robots: { index: false, follow: false },
  };
}

export default async function ResetPasswordPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  // We need a session to update the password. If the callback didn't
  // produce one (link expired, already used), the form tells them.
  const user = await getCurrentUser();

  return (
    <section className="container flex justify-center py-16 md:py-24">
      <div className="w-full max-w-sm">
        <div className="eyebrow">{t("reset_title")}</div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {t("reset_title")}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-mid">
          {t("reset_lede")}
        </p>

        <div className="mt-10">
          <ResetPasswordForm locale={locale} hasSession={user !== null} />
        </div>
      </div>
    </section>
  );
}
