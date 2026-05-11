// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/orders/[number]/return — customer return-request form.
//
// Server wrapper that:
//   · Requires the caller to be signed in as the order owner.
//   · Loads the order; 404s if it's missing or not theirs.
//   · Bounces back to the order if it isn't in a returnable status.
//   · Renders the client form, pre-populated with the line items.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { Link } from "@/i18n/routing";
import { requireCustomer } from "@/lib/auth";
import { getMyOrderByNumber } from "@/lib/queries/orders";

import { ReturnForm } from "./return-form";

type Props = { params: Promise<{ locale: string; number: string }> };

// Order states that can be returned/cancelled by the customer.
// PAID + FULFILLING are pre-ship cancellations (handled as full refunds,
// no parcel pickup needed). SHIPPED + DELIVERED are standard RMAs.
const RETURNABLE = new Set(["PAID", "FULFILLING", "SHIPPED", "DELIVERED"]);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "returns" });
  return {
    title: t("form_meta_title"),
    robots: { index: false, follow: false },
  };
}

export default async function ReturnRequestPage({ params }: Props) {
  const { locale, number } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/orders/${number}/return`,
  });

  const order = await getMyOrderByNumber(profile.id, number, locale);
  if (!order) notFound();

  // If the order isn't returnable, bounce them to its detail page — the
  // "Request a return" CTA is only shown when it is, so this is defensive.
  if (!RETURNABLE.has(order.status)) {
    redirect(`/${locale}/account/orders/${encodeURIComponent(order.publicNumber)}`);
  }

  const t = await getTranslations("returns");

  return (
    <section>
      <Link
        href={`/account/orders/${order.publicNumber}`}
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("form_back_to_order", { number: order.publicNumber })}
      </Link>

      <div className="mt-5">
        <div className="eyebrow">{t("form_eyebrow")}</div>
        <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
          {t("form_title")}
        </h1>
        <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
          {t("form_lede")}
        </p>
      </div>

      <div className="rule my-10" />

      {/* Filter gift card lines out of the return-form selection.
       *  Multi-Purpose Vouchers (EU Dir 2016/1065) cannot be VAT-refunded
       *  at the cardholder's request, our own gift-card PDP states they
       *  are non-refundable, and from a UX standpoint there's no parcel
       *  to send back. Belt + braces: the customer never sees them as
       *  return options, and the admin action layer will also reject
       *  gift-card refunds if anything ever slips through (step 4). */}
      {(() => {
        const refundableItems = order.items.filter(
          (it) => it.productKind !== "GIFT_CARD",
        );
        if (refundableItems.length === 0) {
          // Edge case: order contained ONLY gift cards. There's
          // nothing to return — render a friendly explanation instead
          // of an empty form.
          return (
            <p className="text-[14px] leading-relaxed text-ink-mid">
              {t("form_only_gift_cards")}
            </p>
          );
        }
        return (
          <ReturnForm
            locale={locale}
            orderNumber={order.publicNumber}
            items={refundableItems.map((it) => ({
              id: it.id,
              name: it.nameSnapshot,
              sku: it.skuSnapshot,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              thumbnailUrl: it.thumbnailUrl,
            }))}
          />
        );
      })()}
    </section>
  );
}
