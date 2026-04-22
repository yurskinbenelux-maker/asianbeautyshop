// ─────────────────────────────────────────────────────────────────────────
// /[locale]/sign-in — customer sign-in (email + password).
//
// The top-level /sign-in (no locale) is reserved for admins — this one
// lives inside the public locale tree so the nav, footer, and cookie
// banner wrap it naturally.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { getCurrentCustomer } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInForm } from "./sign-in-form";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
};

export async function generateMetadata({
  params,
}: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    title: t("sign_in_title"),
    robots: { index: false, follow: false },
  };
}

export default async function CustomerSignInPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);

  // Already signed in?  Straight to the account (or `next`).
  const current = await getCurrentCustomer();
  if (current) {
    const target =
      next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : `/${locale}/account`;
    redirect(target);
  }

  const t = await getTranslations("auth");

  return (
    <section className="container flex justify-center py-16 md:py-24">
      <div className="w-full max-w-sm">
        <div className="eyebrow">{t("sign_in_title")}</div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {t("sign_in_title")}
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-mid">
          {t("sign_in_lede")}
        </p>

        <div className="mt-10">
          <SignInForm locale={locale} next={next ?? ""} />
        </div>

        <p className="mt-10 text-[13px] text-ink-mid">
          {t("sign_in_no_account")}{" "}
          <Link
            href="/sign-up"
            className="text-ink underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
          >
            {t("sign_in_create_account")}
          </Link>
        </p>
      </div>
    </section>
  );
}
