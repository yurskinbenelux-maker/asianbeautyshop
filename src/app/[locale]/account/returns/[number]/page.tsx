// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/returns/[number] — detail for one return.
//
// Shows:
//   · public reference (YUR-1042-R1) + status pill
//   · the order it belongs to (linked)
//   · line items being returned + the reason the customer gave
//   · optional tracking number/url (set by Sofia in admin)
//   · refund total + date once the return is REFUNDED
//   · "Cancel request" button while still REQUESTED
//
// 404s when the return doesn't belong to the signed-in user — guarding
// against number guessing.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { Link } from "@/i18n/routing";
import { requireCustomer } from "@/lib/auth";
import { getReturnByPublicNumberForUser } from "@/lib/returns/db";
import { formatEur, priceLocale } from "@/lib/utils";
import { ReturnStatusPill } from "@/components/account/return-status-pill";

import { cancelReturnAction } from "./actions";

type Props = { params: Promise<{ locale: string; number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, number } = await params;
  const t = await getTranslations({ locale, namespace: "returns" });
  return {
    title: t("detail_meta_title", { number }),
    robots: { index: false, follow: false },
  };
}

export default async function ReturnDetailPage({ params }: Props) {
  const { locale, number } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/returns/${number}`,
  });

  const t = await getTranslations("returns");
  const ret = await getReturnByPublicNumberForUser(profile.id, number);
  if (!ret) notFound();

  const euro = (v: number) => formatEur(v, priceLocale(locale));
  const dateFmt = new Intl.DateTimeFormat(priceLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section>
      <Link
        href="/account/returns"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("detail_back")}
      </Link>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
        <div>
          <div className="eyebrow">{t("detail_eyebrow")}</div>
          <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
            {ret.publicNumber}
          </h1>
          <div className="mt-2 text-[13px] text-ink-mid">
            {t("detail_for_order", { number: ret.orderPublicNumber })}
            {" · "}
            {t("row_requested_on", {
              date: dateFmt.format(ret.createdAt),
            })}
          </div>
        </div>
        <div className="self-start md:self-end">
          <ReturnStatusPill status={ret.status} />
        </div>
      </div>

      <div className="rule my-10" />

      {/* items */}
      <div>
        <h2 className="font-display text-[22px] leading-tight text-ink">
          {t("detail_items_heading")}
        </h2>
        <ul className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
          {ret.items.map((it) => (
            <li
              key={it.id}
              className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between md:gap-6"
            >
              <div>
                <div className="font-display text-[15px] text-ink">
                  {it.nameSnapshot}
                </div>
                <div className="mt-0.5 text-[12px] text-ink-mid">
                  {t("form_sku_price", {
                    sku: it.skuSnapshot,
                    price: euro(it.unitPrice),
                  })}
                </div>
              </div>
              <div className="flex items-center gap-6 md:justify-end">
                <div className="text-[13px] text-ink-mid">
                  {t("detail_qty", { qty: it.quantity })}
                </div>
                <div className="font-display text-[15px] text-ink min-w-[5rem] text-right">
                  {euro(it.lineTotal)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* reason */}
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-display text-[18px] leading-tight text-ink">
            {t("detail_reason_heading")}
          </h2>
          <p className="mt-3 text-[14px] text-ink">
            {t(`reason.${ret.reason}` as ReasonKey)}
          </p>
          {ret.details && (
            <p className="mt-4 whitespace-pre-line border-l-2 border-ink/10 pl-4 text-[13px] leading-relaxed text-ink-mid">
              {ret.details}
            </p>
          )}
        </div>

        {/* tracking + refund */}
        <div>
          <h2 className="font-display text-[18px] leading-tight text-ink">
            {t("detail_status_heading")}
          </h2>
          <dl className="mt-4 space-y-3 text-[13px]">
            {ret.trackingNumber && (
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-label text-ink-mid">
                  {t("detail_tracking_number")}
                </dt>
                <dd className="font-mono text-[12px] text-ink">
                  {ret.trackingNumber}
                </dd>
              </div>
            )}
            {ret.receivedAt && (
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-label text-ink-mid">
                  {t("detail_received_on")}
                </dt>
                <dd className="text-ink">{dateFmt.format(ret.receivedAt)}</dd>
              </div>
            )}
            {ret.refundAmount !== null && (
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-label text-ink-mid">
                  {t("detail_refund_amount")}
                </dt>
                <dd className="text-ink">{euro(ret.refundAmount)}</dd>
              </div>
            )}
            {ret.refundedAt && (
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-label text-ink-mid">
                  {t("detail_refunded_on")}
                </dt>
                <dd className="text-ink">{dateFmt.format(ret.refundedAt)}</dd>
              </div>
            )}
          </dl>

          {ret.trackingUrl && (
            <a
              href={ret.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-block h-11 bg-ink px-5 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion leading-[2.75rem]"
            >
              {t("detail_track_cta")}
            </a>
          )}
        </div>
      </div>

      {/* cancel */}
      {ret.status === "REQUESTED" && (
        <>
          <div className="rule my-10" />
          <form action={cancelReturnAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="publicNumber" value={ret.publicNumber} />
            <p className="text-[13px] text-ink-mid">
              {t("detail_cancel_hint")}
            </p>
            <button
              type="submit"
              className="mt-3 inline-block border border-ink/20 px-5 py-3 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-vermilion hover:text-vermilion"
            >
              {t("detail_cancel_cta")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

type ReasonKey =
  | "reason.CHANGED_MIND"
  | "reason.WRONG_ITEM"
  | "reason.DAMAGED"
  | "reason.DEFECTIVE"
  | "reason.ARRIVED_LATE"
  | "reason.ALLERGIC_REACTION"
  | "reason.OTHER";
