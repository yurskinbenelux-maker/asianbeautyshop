// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/addresses — list + manage saved addresses.
//
// Each card renders the formatted address, a "default" badge, and three
// action forms (set default / edit / delete) posted to server actions.
// "Add new" CTA at the top routes to /account/addresses/new.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Plus, Pencil } from "lucide-react";
import { Link } from "@/i18n/routing";
import { requireCustomer } from "@/lib/auth";
import { listMyAddresses } from "@/lib/queries/addresses";
import {
  deleteAddressAction,
  setDefaultAddressAction,
} from "./actions";

type Props = { params: Promise<{ locale: string }> };

export default async function AddressesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/addresses",
  });

  const t = await getTranslations("account");
  const addresses = await listMyAddresses(profile.id);

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="eyebrow">{t("eyebrow")}</div>
          <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
            {t("addresses_title")}
          </h1>
          <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
            {t("addresses_lede")}
          </p>
        </div>
        <Link
          href="/account/addresses/new"
          className="inline-flex items-center gap-2 self-start h-11 bg-ink px-5 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion md:self-end"
        >
          <Plus className="h-4 w-4" />
          {t("addresses_add_new")}
        </Link>
      </div>

      <div className="rule my-10" />

      {addresses.length === 0 ? (
        <div className="border border-ink/10 bg-white/50 px-8 py-14 text-center">
          <div className="eyebrow">{t("addresses_empty_eyebrow")}</div>
          <h2 className="mt-3 font-display text-[24px] leading-tight text-ink">
            {t("addresses_empty_title")}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-ink-mid">
            {t("addresses_empty_body")}
          </p>
          <Link
            href="/account/addresses/new"
            className="mt-6 inline-block h-11 bg-ink px-6 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion leading-[2.75rem]"
          >
            {t("addresses_empty_cta")}
          </Link>
        </div>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="flex flex-col justify-between border border-ink/10 bg-white/50 p-6"
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="font-display text-[16px] text-ink">
                    {a.firstName} {a.lastName}
                  </div>
                  {a.isDefault && (
                    <span className="seal">{t("addresses_default_badge")}</span>
                  )}
                </div>

                <address className="mt-3 not-italic text-[14px] leading-relaxed text-ink">
                  {a.company && <div>{a.company}</div>}
                  <div>{a.line1}</div>
                  {a.line2 && <div>{a.line2}</div>}
                  <div>
                    {a.postcode} {a.city}
                    {a.region ? `, ${a.region}` : ""}
                  </div>
                  <div className="uppercase tracking-wide">{a.country}</div>
                  {a.phone && (
                    <div className="mt-1 text-ink-mid">{a.phone}</div>
                  )}
                </address>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4 pt-4 border-t border-ink/10">
                <Link
                  href={`/account/addresses/${a.id}`}
                  className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("addresses_edit")}
                </Link>

                {!a.isDefault && (
                  <form action={setDefaultAddressAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <button
                      type="submit"
                      className="text-[11px] uppercase tracking-label text-ink-mid underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
                    >
                      {t("addresses_make_default")}
                    </button>
                  </form>
                )}

                <form action={deleteAddressAction} className="ml-auto">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className="text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
                  >
                    {t("addresses_delete")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
