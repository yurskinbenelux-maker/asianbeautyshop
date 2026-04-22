// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/addresses/[id] — edit an existing address.
// 404s if the id doesn't belong to the caller.
// ─────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/routing";
import { requireCustomer } from "@/lib/auth";
import { getMyAddress } from "@/lib/queries/addresses";
import { AddressForm } from "../address-form";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function EditAddressPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/addresses/${id}`,
  });

  const t = await getTranslations("account");
  const address = await getMyAddress(profile.id, id);
  if (!address) notFound();

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
          {t("addresses_edit_title")}
        </h1>
      </div>

      <div className="rule my-10" />

      <div className="max-w-2xl">
        <AddressForm
          locale={locale}
          mode="edit"
          defaults={{
            id: address.id,
            firstName: address.firstName,
            lastName: address.lastName,
            company: address.company,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            postcode: address.postcode,
            region: address.region,
            country: address.country,
            phone: address.phone,
            isDefault: address.isDefault,
          }}
        />
      </div>
    </section>
  );
}
