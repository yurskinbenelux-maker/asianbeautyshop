// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/returns — customer's list of return requests.
//
// Mirrors the /account/orders page in visual hierarchy so the two feel
// like siblings.  Each row shows:
//   · our return reference (YUR-1042-R1)
//   · the order it belongs to
//   · status pill
//   · request date
//   · "View details" link
//
// Empty state invites them to start a return from a specific order.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { requireCustomer } from "@/lib/auth";
import { getReturnsForUser } from "@/lib/returns/db";
import { priceLocale } from "@/lib/utils";
import { ReturnStatusPill } from "@/components/account/return-status-pill";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "returns" });
  return {
    title: t("meta_title"),
    robots: { index: false, follow: false },
  };
}

export default async function ReturnsListPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/returns",
  });

  const t = await getTranslations("returns");
  const rows = await getReturnsForUser(profile.id);

  const dateFmt = new Intl.DateTimeFormat(priceLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section>
      <div className="eyebrow">{t("eyebrow")}</div>
      <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
        {t("lede")}
      </p>

      <div className="rule my-10" />

      {rows.length === 0 ? (
        <div className="border border-ink/10 bg-white/50 px-8 py-14 text-center">
          <div className="eyebrow">{t("empty_eyebrow")}</div>
          <h2 className="mt-3 font-display text-[24px] leading-tight text-ink">
            {t("empty_title")}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-ink-mid">
            {t("empty_body")}
          </p>
          <Link
            href="/account/orders"
            className="mt-6 inline-block h-11 bg-ink px-6 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion leading-[2.75rem]"
          >
            {t("empty_cta")}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-ink/10 border-y border-ink/10">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between md:gap-6"
            >
              <div>
                <div className="font-display text-[15px] text-ink">
                  {r.publicNumber}
                </div>
                <div className="mt-0.5 text-[12px] text-ink-mid">
                  {t("row_order", { number: r.orderPublicNumber })}
                  {" · "}
                  {t("row_requested_on", {
                    date: dateFmt.format(r.createdAt),
                  })}
                </div>
              </div>

              <div className="flex items-center gap-6 md:justify-end">
                <ReturnStatusPill status={r.status} />
                <Link
                  href={`/account/returns/${r.publicNumber}`}
                  className="text-[11px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
                >
                  {t("row_view")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
