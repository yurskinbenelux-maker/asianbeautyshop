// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/profile — personal info + password change.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Locale } from "@prisma/client";
import { requireCustomer } from "@/lib/auth";
import { ProfileForm, PasswordForm } from "./profile-form";

type Props = { params: Promise<{ locale: string }> };

// Prisma enum → URL-style locale code.
function fromPrismaLocale(l: Locale): "en" | "nl" | "fr" | "ru" {
  switch (l) {
    case Locale.NL:
      return "nl";
    case Locale.FR:
      return "fr";
    case Locale.RU:
      return "ru";
    default:
      return "en";
  }
}

export default async function ProfilePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/profile",
  });

  const t = await getTranslations("account");

  return (
    <section>
      <div className="eyebrow">{t("eyebrow")}</div>
      <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
        {t("profile_title")}
      </h1>
      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
        {t("profile_lede")}
      </p>

      <div className="rule my-10" />

      {/* ── personal info ──────────────────────────────────────── */}
      <div className="max-w-2xl">
        <h2 className="font-display text-[22px] leading-tight text-ink">
          {t("profile_personal_heading")}
        </h2>

        <div className="mt-6">
          <ProfileForm
            locale={locale}
            defaults={{
              email: profile.email,
              firstName: profile.firstName ?? "",
              lastName: profile.lastName ?? "",
              phone: profile.phone ?? "",
              // Slice the ISO date so the <input type="date"> reads it
              // cleanly. Empty string when the customer hasn't shared.
              birthday: profile.birthday
                ? profile.birthday.toISOString().slice(0, 10)
                : "",
              preferredLocale: fromPrismaLocale(profile.preferredLocale),
              marketingOptIn: profile.marketingOptIn,
            }}
          />
        </div>
      </div>

      <div className="rule my-12" />

      {/* ── password ───────────────────────────────────────────── */}
      <div className="max-w-2xl">
        <h2 className="font-display text-[22px] leading-tight text-ink">
          {t("profile_password_heading")}
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          {t("profile_password_lede")}
        </p>

        <div className="mt-6">
          <PasswordForm locale={locale} />
        </div>
      </div>
    </section>
  );
}
