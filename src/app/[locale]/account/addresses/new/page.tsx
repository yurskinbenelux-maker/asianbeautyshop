// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/addresses/new — add a new shipping/billing address.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/routing";
import { requireCustomer } from "@/lib/auth";
import { AddressForm } from "../address-form";

type Props = { params: Promise<{ locale: string }> };

export default async function NewAddressPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireCustomer({
    locale,
    redirectTo: "/account/addresses/new",
  });

  const t = await getTranslations("account");

  return (
    <section>
      <Link
        href="/account/addresses"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("addresses_back")}
      </Link>

      <div className="mt-5">
        <div className="eyebrow">{t("eyebrow")}</div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {t("addresses_new_title")}
        </h1>
        <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
          {t("addresses_new_lede")}
        </p>
      </div>

      <div className="rule my-10" />

      <div className="max-w-2xl">
        <AddressForm locale={locale} mode="create" />
      </div>
    </section>
  );
}
