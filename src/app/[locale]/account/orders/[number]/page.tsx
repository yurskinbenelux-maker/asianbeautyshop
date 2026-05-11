// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/orders/[number] — a single order, full detail.
//
// Shows:
//   • status ribbon + placement date
//   • line items (thumbnail, name, qty, unit price, line total, link to PDP)
//   • shipping + billing addresses side by side
//   • totals breakdown (subtotal, discount, shipping, tax, grand total)
//   • tracking CTA (if carrier posted a URL) + invoice link (if generated)
//
// 404s via `notFound()` if the number is bogus or owned by someone else —
// keeps guessing attacks from revealing that an order exists for another
// customer.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/routing";
import { requireCustomer } from "@/lib/auth";
import { getMyOrderByNumber, type FormattedAddress } from "@/lib/queries/orders";
import { prisma } from "@/lib/prisma";
import { formatEur, priceLocale } from "@/lib/utils";
import { OrderReviewForm } from "@/components/account/order-review-form";
import { ReorderButton } from "@/components/account/reorder-button";
import { OrderTimeline } from "@/components/account/order-timeline";
import { RetryPaymentButton } from "@/components/account/retry-payment-button";

type Props = { params: Promise<{ locale: string; number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, number } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return {
    title: t("order_number", { number }),
    robots: { index: false, follow: false },
  };
}

export default async function OrderDetailPage({ params }: Props) {
  const { locale, number } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/orders/${number}`,
  });

  const t = await getTranslations("account");
  const order = await getMyOrderByNumber(profile.id, number, locale);
  if (!order) notFound();

  // Pull the set of productIds the customer has already reviewed for the
  // products in this order. Used below to gate the "leave a review" trigger
  // — re-submission is blocked at the server-action level too, but hiding
  // the entry point is the right UX (and avoids a misleading affordance).
  // Only worth running when the order is DELIVERED; the form isn't shown
  // otherwise.
  const reviewedProductIds = new Set<string>();
  if (order.status === "DELIVERED") {
    const reviewed = await prisma.review.findMany({
      where: {
        userId: profile.id,
        productId: { in: order.items.map((it) => it.productId) },
      },
      select: { productId: true },
    });
    for (const r of reviewed) reviewedProductIds.add(r.productId);
  }

  const euro = (v: number) => formatEur(v, priceLocale(locale));
  const dateFmt = new Intl.DateTimeFormat(priceLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section>
      {/* ── back-link + header ─────────────────────────────────── */}
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-vermilion"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("order_back_to_orders")}
      </Link>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
        <div>
          <div className="eyebrow">{t("order_eyebrow")}</div>
          <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
            {t("order_number", { number: order.publicNumber })}
          </h1>
          <div className="mt-2 text-[13px] text-ink-mid">
            {t("order_placed_on", { date: dateFmt.format(order.placedAt) })}
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 self-start md:items-end md:self-end">
          <span className="seal">
            {t(`order_status.${order.status}` as OrderStatusKey)}
          </span>
          {/* G4: retry-payment CTA — surfaces when the order is stuck
           *  in PENDING + FAILED/EXPIRED/CANCELED. Clicks mint a fresh
           *  Mollie payment URL and redirect to the new hosted page,
           *  so the path works regardless of how long ago the order
           *  was placed (the original Mollie URL expires after 24h).
           *  We deliberately render it BEFORE the reorder button — a
           *  stuck-payment order is a "finish this" CTA, not a
           *  "buy again" CTA. */}
          {order.status === "PENDING" &&
            ["FAILED", "EXPIRED", "CANCELED"].includes(order.paymentStatus) && (
              <RetryPaymentButton
                orderId={order.id}
                locale={locale}
                label={t("order_retry_payment")}
                variant="outline"
              />
            )}
          {/* One-click reorder — only meaningful once the order has
              actually been delivered (or shipped, but we still show
              earlier so customers can pre-stock for next month). */}
          <ReorderButton orderNumber={order.publicNumber} urlLocale={locale} />
        </div>
      </div>

      <div className="rule my-10" />

      {/* ── timeline (G1) — primary "where is my parcel" answer.
       *  Symmetric to the return timeline (A3) so the two pages
       *  read as a coherent system. Surfaces tracking on SHIPPED
       *  and collapses to a closure card for CANCELLED/REFUNDED. */}
      <OrderTimeline
        status={order.status}
        formatDate={(d) => dateFmt.format(d)}
        placedAt={order.placedAt}
        paidAt={order.paidAt}
        shippedAt={order.shippedAt}
        deliveredAt={order.deliveredAt}
        trackingUrl={order.trackingUrl}
        trackingNumber={order.trackingNumber}
      />

      <div className="rule my-10" />

      {/* ── items ─────────────────────────────────────────────── */}
      <div>
        <h2 className="font-display text-[22px] leading-tight text-ink">
          {t("order_items_heading")}
        </h2>
        <ul className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
          {order.items.map((it) => {
            const canReview =
              order.status === "DELIVERED" &&
              !reviewedProductIds.has(it.productId);
            const alreadyReviewed =
              order.status === "DELIVERED" &&
              reviewedProductIds.has(it.productId);
            return (
              <li
                key={it.id}
                className="flex flex-col gap-4 py-5 md:gap-3"
              >
                {/* Top row: thumbnail + name + qty/price */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
                  <div className="flex items-center gap-4 md:flex-1">
                    {it.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.thumbnailUrl}
                        alt=""
                        className="h-16 w-16 shrink-0 border border-rice bg-white/50 object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 shrink-0 border border-ink/10 bg-white/50" />
                    )}
                    <div className="min-w-0">
                      <div className="font-display text-[15px] text-ink">
                        {it.slug ? (
                          <Link
                            href={`/shop/${it.slug}`}
                            className="transition-colors hover:text-vermilion"
                          >
                            {it.nameSnapshot}
                          </Link>
                        ) : (
                          it.nameSnapshot
                        )}
                      </div>
                      <div className="mt-0.5 text-[12px] text-ink-mid">
                        {t("order_sku", { sku: it.skuSnapshot })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-6 md:justify-end">
                    <div className="text-[13px] text-ink-mid">
                      {t("order_qty_x_price", {
                        qty: it.quantity,
                        price: euro(it.unitPrice),
                      })}
                    </div>
                    <div className="font-display text-[15px] text-ink min-w-[5rem] text-right">
                      {euro(it.lineTotal)}
                    </div>
                  </div>
                </div>

                {/* Bottom row: review entry-point. Renders only on DELIVERED
                    orders. Two paths: form trigger (collapsed by default)
                    or a quiet "already reviewed" badge. */}
                {canReview && (
                  <OrderReviewForm
                    orderNumber={order.publicNumber}
                    productId={it.productId}
                    productName={it.nameSnapshot}
                    urlLocale={locale}
                  />
                )}
                {alreadyReviewed && (
                  <p className="mt-1 text-[11px] uppercase tracking-label text-ink-mid">
                    {t("review_form.already_reviewed_label")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── totals + tracking ───────────────────────────────── */}
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {/* tracking + invoice */}
        <div>
          <h2 className="font-display text-[18px] leading-tight text-ink">
            {t("order_shipment_heading")}
          </h2>
          <dl className="mt-4 space-y-3 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="uppercase tracking-label text-ink-mid">
                {t("order_payment_status")}
              </dt>
              <dd className="text-ink">
                {t(`order_payment_status.${order.paymentStatus}` as PaymentKey)}
              </dd>
            </div>
            {order.paidAt && (
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-label text-ink-mid">
                  {t("order_paid_at")}
                </dt>
                <dd className="text-ink">{dateFmt.format(order.paidAt)}</dd>
              </div>
            )}
            {order.shippedAt && (
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-label text-ink-mid">
                  {t("order_shipped_at")}
                </dt>
                <dd className="text-ink">{dateFmt.format(order.shippedAt)}</dd>
              </div>
            )}
            {order.deliveredAt && (
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-label text-ink-mid">
                  {t("order_delivered_at")}
                </dt>
                <dd className="text-ink">
                  {dateFmt.format(order.deliveredAt)}
                </dd>
              </div>
            )}
            {order.trackingNumber && (
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-label text-ink-mid">
                  {t("order_tracking_number")}
                </dt>
                <dd className="text-ink font-mono text-[12px]">
                  {order.trackingNumber}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            {order.trackingUrl && (
              <a
                href={order.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block h-11 bg-ink px-5 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion leading-[2.75rem]"
              >
                {t("order_track_shipment")}
              </a>
            )}
            {order.invoiceUrl && (
              // H7 fix: `order.invoiceUrl` historically holds the raw
              // Supabase Storage PATH (e.g. "2026/INV-2026-00014.pdf"),
              // not a clickable URL. Using it as <a href> resolved
              // relative to the current page → 404 ("Nothing here.").
              // Route through the customer download endpoint which
              // mints a 60-second signed URL and 302-redirects. The
              // endpoint also re-checks order ownership, so this is
              // safer than handing out a raw signed URL anyway.
              <a
                href={`/account/orders/${order.publicNumber}/invoice`}
                target="_blank"
                rel="noreferrer"
                className="inline-block h-11 border border-ink/20 px-5 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:text-vermilion leading-[2.75rem]"
              >
                {t("order_download_invoice")}
              </a>
            )}
            {/* Returns/cancellation entry point. Visible from the moment
                payment clears — pre-ship requests are handled as
                cancellations on the admin side, post-ship as full RMAs.
                Belgian/EU 14-day cooling-off clock still starts at
                delivery; this just lets customers self-serve initiate
                the request without waiting for a shipped/delivered
                status. Set: PAID, FULFILLING, SHIPPED, DELIVERED. */}
            {(["PAID", "FULFILLING", "SHIPPED", "DELIVERED"] as const).includes(
              order.status as "PAID" | "FULFILLING" | "SHIPPED" | "DELIVERED",
            ) && (
              <Link
                href={`/account/orders/${order.publicNumber}/return`}
                className="inline-block h-11 border border-ink/20 px-5 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:text-vermilion leading-[2.75rem]"
              >
                {t("order_request_return")}
              </Link>
            )}
          </div>
        </div>

        {/* totals */}
        <div>
          <h2 className="font-display text-[18px] leading-tight text-ink">
            {t("order_totals_heading")}
          </h2>
          <dl className="mt-4 space-y-2 text-[14px]">
            <Row
              label={t("order_subtotal")}
              value={euro(order.subtotal)}
              muted
            />
            {order.discountTotal > 0 && (
              <Row
                label={
                  order.couponCode
                    ? t("order_discount_with_code", { code: order.couponCode })
                    : t("order_discount")
                }
                value={`− ${euro(order.discountTotal)}`}
                muted
              />
            )}
            <Row
              label={t("order_shipping")}
              value={euro(order.shippingTotal)}
              muted
            />
            <Row
              label={t("order_tax")}
              value={euro(order.taxTotal)}
              muted
            />
            <div className="rule my-3" />
            <Row
              label={t("order_grand_total")}
              value={euro(order.grandTotal)}
              bold
            />
          </dl>
        </div>
      </div>

      {/* ── addresses ─────────────────────────────────────────── */}
      {(order.shippingAddress || order.billingAddress) && (
        <>
          <div className="rule my-12" />
          <div className="grid gap-10 md:grid-cols-2">
            {order.shippingAddress && (
              <AddressBlock
                title={t("order_shipping_address")}
                a={order.shippingAddress}
              />
            )}
            {order.billingAddress && (
              <AddressBlock
                title={t("order_billing_address")}
                a={order.billingAddress}
              />
            )}
          </div>
        </>
      )}

      {order.notes && (
        <>
          <div className="rule my-12" />
          <div>
            <h2 className="font-display text-[18px] leading-tight text-ink">
              {t("order_notes_heading")}
            </h2>
            <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-ink-mid">
              {order.notes}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt
        className={
          bold
            ? "font-display text-[16px] text-ink"
            : muted
              ? "text-ink-mid"
              : "text-ink"
        }
      >
        {label}
      </dt>
      <dd
        className={
          bold
            ? "font-display text-[18px] text-ink"
            : "text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function AddressBlock({
  title,
  a,
}: {
  title: string;
  a: FormattedAddress;
}) {
  return (
    <div>
      <h2 className="font-display text-[18px] leading-tight text-ink">
        {title}
      </h2>
      <address className="mt-4 not-italic text-[14px] leading-relaxed text-ink">
        <div>
          {a.firstName} {a.lastName}
        </div>
        {a.company && <div>{a.company}</div>}
        <div>{a.line1}</div>
        {a.line2 && <div>{a.line2}</div>}
        <div>
          {a.postcode} {a.city}
          {a.region ? `, ${a.region}` : ""}
        </div>
        <div className="uppercase tracking-wide">{a.country}</div>
        {a.phone && <div className="mt-1 text-ink-mid">{a.phone}</div>}
      </address>
    </div>
  );
}

type OrderStatusKey =
  | "order_status.PENDING"
  | "order_status.PAID"
  | "order_status.FULFILLING"
  | "order_status.SHIPPED"
  | "order_status.DELIVERED"
  | "order_status.CANCELLED"
  | "order_status.REFUNDED"
  | "order_status.PARTIALLY_REFUNDED";

type PaymentKey =
  | "order_payment_status.UNPAID"
  | "order_payment_status.AUTHORIZED"
  | "order_payment_status.PAID"
  | "order_payment_status.FAILED"
  | "order_payment_status.REFUNDED"
  | "order_payment_status.PARTIALLY_REFUNDED";
