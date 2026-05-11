// ─────────────────────────────────────────────────────────────────────────
// /[locale]/checkout/failure — return URL when Mollie checkout is
// cancelled or a payment method fails.
//
// We also sync on this route so the Order's paymentStatus is FAILED by the
// time the customer reads the page. Gives them a one-click retry link to
// `molliePaymentUrl` — Mollie keeps the hosted pay page active for a
// while after cancellation so this works.
// ─────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { XCircle } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { syncByPublicNumber } from "@/lib/checkout/sync-mollie";
import { Link } from "@/i18n/routing";
import { RetryPaymentButton } from "@/components/account/retry-payment-button";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ order?: string; reason?: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return {
    title: t("failure_title"),
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutFailurePage({
  params,
  searchParams,
}: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  const publicNumber = sp.order;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "checkout" });

  if (!publicNumber) {
    redirect(`/${locale}/cart`);
  }

  // Re-sync so Mollie's "canceled" / "expired" / "failed" status lands on
  // the Order row in our DB. Even if Mollie hasn't webhooked us yet, the
  // admin sees an up-to-date status within seconds of the customer
  // returning.
  await syncByPublicNumber(publicNumber);

  const order = await prisma.order.findUnique({
    where: { publicNumber },
    select: {
      id: true,
      publicNumber: true,
      molliePaymentUrl: true,
      // G4: gate the retry button on status — only PENDING orders with
      // a paymentStatus that genuinely failed get the CTA. PAID orders
      // shouldn't even reach this page; if they do (Mollie returned
      // late on the cancel URL), we don't want to confuse the user.
      status: true,
      paymentStatus: true,
    },
  });

  if (!order) {
    redirect(`/${locale}`);
  }

  return (
    <section className="mx-auto max-w-2xl px-6 pb-24 pt-20 text-center md:px-10">
      <div
        aria-hidden
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-vermilion/40 bg-vermilion/5 text-vermilion"
      >
        <XCircle className="h-7 w-7" aria-hidden />
      </div>

      <div className="eyebrow mt-6">{t("failure_eyebrow")}</div>
      <h1 className="mt-3 font-display text-display-md leading-tight text-ink">
        {t("failure_title")}
      </h1>
      <p className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-ink-mid">
        {t("failure_lede")}
      </p>

      <div className="mx-auto mt-10 max-w-sm border border-ink/10 bg-white/60 p-6 text-left">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-label text-ink-mid">
            {t("success_order_label")}
          </span>
          <span className="font-display text-[16px] text-ink">
            {order.publicNumber}
          </span>
        </div>
      </div>

      {/* G4: replaced the static <a href={molliePaymentUrl}> with a
       *  server action that mints a fresh Mollie payment on click. The
       *  static link broke 24h after order placement because Mollie
       *  expires hosted payment URLs; the action creates a new one
       *  every time so the retry path works indefinitely.
       *
       *  Only render the retry CTA when the order is genuinely
       *  retryable. PENDING + FAILED/EXPIRED/CANCELED is what
       *  retryOrderPaymentAction also gates on internally — duplicated
       *  here so we don't render a button that 'll immediately error. */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        {order.status === "PENDING" &&
          ["FAILED", "EXPIRED", "CANCELED"].includes(order.paymentStatus) && (
            <RetryPaymentButton
              orderId={order.id}
              locale={locale}
              label={t("failure_cta_retry")}
              variant="primary"
            />
          )}
        <Link
          href="/cart"
          className="h-12 border border-ink px-6 text-[12px] uppercase tracking-label leading-[2.75rem] text-ink transition-colors hover:bg-ink hover:text-rice"
        >
          {t("failure_cta_back_to_cart")}
        </Link>
      </div>
    </section>
  );
}
