// ─────────────────────────────────────────────────────────────────────────
// /[locale]/checkout/success — return URL after a successful Mollie pay.
//
// Why re-sync on the return URL?
//   On localhost there's no public webhook URL so Mollie can't push us a
//   status callback — the first time we ever learn the payment succeeded
//   is when the customer lands back here. Even in production, webhooks
//   can be delayed by a few seconds, so polling on return is a belt-and-
//   braces that keeps the customer from seeing "we're still processing"
//   when Mollie already knows they paid.
//
// This page is server-rendered so the sync happens before anything is
// shown to the customer — no flash of "pending" state.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { formatEur, priceLocale } from "@/lib/utils";
import { syncByPublicNumber } from "@/lib/checkout/sync-mollie";
import { Link } from "@/i18n/routing";
import { Check, Clock } from "lucide-react";
import { PurchaseTracker } from "@/components/analytics/purchase-tracker";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ order?: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return {
    title: t("success_title"),
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await params;
  const { order: publicNumber } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "checkout" });
  const currencyLocale = priceLocale(locale);

  if (!publicNumber) {
    redirect(`/${locale}/cart`);
  }

  // 1. Re-sync with Mollie first. Safe to call even if the webhook already
  //    ran — it's idempotent and will no-op when the state hasn't changed.
  await syncByPublicNumber(publicNumber);

  // 2. Re-read the fresh order state.
  //    We pull the line items + tax/shipping/coupon too — the success
  //    page renders only the totals visually, but the analytics
  //    PurchaseTracker needs the full breakdown to push a GA4-shaped
  //    `purchase` event for both GA4 ecommerce reports and the Google
  //    Ads conversion. Skipping the join would mean GA4 sees revenue
  //    but no items, which breaks the product-performance reports
  //    Sofia will care about most.
  const order = await prisma.order.findUnique({
    where: { publicNumber },
    select: {
      id: true,
      publicNumber: true,
      email: true,
      status: true,
      paymentStatus: true,
      subtotal: true,
      taxTotal: true,
      shippingTotal: true,
      grandTotal: true,
      currency: true,
      couponCode: true,
      molliePaymentUrl: true,
      items: {
        select: {
          quantity: true,
          unitPrice: true,
          nameSnapshot: true,
          skuSnapshot: true,
          product: {
            select: {
              // Note: Product itself has no `slug` — slugs live on
              // ProductTranslation (per-locale). For GA4 item_id we use
              // the OrderItem's skuSnapshot instead, which is stable and
              // already locale-agnostic. We only need the live Product
              // here for the brand line + first category.
              productLine: true,
              categories: {
                select: { category: { select: { slug: true } } },
                take: 1,
              },
            },
          },
          variant: {
            // ProductVariant.label is the customer-facing string like
            // "50 ml" / "Travel size" — what GA4 expects in item_variant.
            select: { label: true },
          },
        },
      },
    },
  });

  if (!order) {
    // Bad order number in URL — send them home rather than 500.
    redirect(`/${locale}`);
  }

  const paid = order.paymentStatus === PaymentStatus.PAID;
  const grandTotalEur = Number(order.grandTotal);

  // Build the GA4 purchase payload from the order. We only fire when
  // paymentStatus === PAID — pending / failed orders are not conversions
  // and would otherwise inflate Smart Bidding's signal. Idempotency is
  // already handled at the GA4 + Ads side via `transaction_id`, but the
  // PurchaseTracker also guards against double-fire in dev (Strict Mode).
  const purchasePayload = paid
    ? {
        transaction_id: order.publicNumber,
        value: grandTotalEur,
        tax: Number(order.taxTotal ?? 0),
        shipping: Number(order.shippingTotal ?? 0),
        currency: order.currency || "EUR",
        coupon: order.couponCode ?? undefined,
        items: order.items.map((item) => ({
          // skuSnapshot is the stable per-product identifier captured at
          // order placement time. Survives later product renames /
          // deletions, and matches what's printed on the invoice +
          // shipping label so cross-tool reconciliation works.
          item_id: item.skuSnapshot,
          item_name: item.nameSnapshot,
          price: Number(item.unitPrice),
          quantity: item.quantity,
          item_category: item.product?.categories[0]?.category.slug,
          item_brand: item.product?.productLine ?? "YU.R",
          item_variant: item.variant?.label,
        })),
      }
    : null;

  return (
    <section className="mx-auto max-w-2xl px-6 pb-24 pt-20 text-center md:px-10">
      {/* GA4 + Google Ads conversion. Renders only when the order is
          confirmed PAID; the component itself is a render-null sink that
          fires `dataLayer.push({event: 'purchase', ...})` once on mount. */}
      {purchasePayload ? <PurchaseTracker {...purchasePayload} /> : null}
      <div
        aria-hidden
        className={
          "mx-auto flex h-16 w-16 items-center justify-center rounded-full border " +
          (paid
            ? "border-sage/40 bg-sage/10 text-sage"
            : "border-ink/15 bg-white/60 text-ink-mid")
        }
      >
        {paid ? (
          <Check className="h-7 w-7" aria-hidden />
        ) : (
          <Clock className="h-7 w-7" aria-hidden />
        )}
      </div>

      <div className="eyebrow mt-6">
        {paid ? t("success_eyebrow") : t("success_pending_eyebrow")}
      </div>
      <h1 className="mt-3 font-display text-display-md leading-tight text-ink">
        {paid ? t("success_title") : t("success_pending_title")}
      </h1>
      <p className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-ink-mid">
        {paid
          ? t("success_lede", { email: order.email })
          : t("success_pending_lede")}
      </p>

      {/* Receipt-style block */}
      <div className="mx-auto mt-10 max-w-sm border border-ink/10 bg-white/60 p-6 text-left">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-label text-ink-mid">
            {t("success_order_label")}
          </span>
          <span className="font-display text-[16px] text-ink">
            {order.publicNumber}
          </span>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-label text-ink-mid">
            {t("success_total_label")}
          </span>
          <span className="font-display text-[18px] text-ink">
            {formatEur(grandTotalEur, currencyLocale)}
          </span>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/shop"
          className="h-12 bg-ink px-6 text-[12px] uppercase tracking-label leading-[3rem] text-rice transition-colors hover:bg-vermilion"
        >
          {t("success_cta_shop")}
        </Link>
        {!paid && order.molliePaymentUrl && (
          <a
            href={order.molliePaymentUrl}
            className="h-12 border border-ink px-6 text-[12px] uppercase tracking-label leading-[2.75rem] text-ink transition-colors hover:bg-ink hover:text-rice"
          >
            {t("success_cta_retry")}
          </a>
        )}
      </div>
    </section>
  );
}
