// ─────────────────────────────────────────────────────────────────────────
// /[locale]/sign-up — create a new customer account.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { SignUpForm } from "./sign-up-form";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    title: t("sign_up_title"),
    robots: { index: false, follow: false },
  };
}

export default async function SignUpPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Already signed in?  Off to the account.
  const current = await getCurrentCustomer();
  if (current) redirect(`/${locale}/account`);

  const t = await getTranslations("auth");

  return (
    <section className="container flex justify-center py-16 md:py-24">
      <div className="w-full max-w-md">
        <div className="eyebrow">{t("sign_up_title")}</div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {t("sign_up_title")}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-mid">
          {t("sign_up_lede")}
        </p>

        <div className="mt-10">
          <SignUpForm locale={locale} />
        </div>

        <p className="mt-10 text-[13px] text-ink-mid">
          {t("sign_up_have_account")}{" "}
          <Link
            href="/sign-in"
            className="text-ink underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
          >
            {t("sign_up_sign_in")}
          </Link>
        </p>
      </div>
    </section>
  );
}
