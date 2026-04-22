// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/orders — full list of this customer's orders.
//
// Same row design as the overview's "recent orders" strip, just without
// the 3-item cap. Empty state points them at the shop.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { requireCustomer } from "@/lib/auth";
import { listMyOrders } from "@/lib/queries/orders";
import { formatEur, priceLocale } from "@/lib/utils";
import {
  OrderStatusPill,
  type OrderStatusKey,
} from "@/components/account/order-status-pill";

type Props = { params: Promise<{ locale: string }> };

export default async function OrdersListPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/orders",
  });

  const t = await getTranslations("account");
  const orders = await listMyOrders(profile.id);

  const dateFmt = new Intl.DateTimeFormat(priceLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section>
      <div className="eyebrow">{t("eyebrow")}</div>
      <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
        {t("orders_title")}
      </h1>
      <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
        {t("orders_lede")}
      </p>

      <div className="rule my-10" />

      {orders.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-ink/10 border-y border-ink/10">
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between md:gap-6"
            >
              <div className="flex items-center gap-4">
                {/* thumbnails */}
                <div className="flex -space-x-2">
                  {o.thumbnails.length === 0 ? (
                    <div className="h-10 w-10 border border-ink/10 bg-white/50" />
                  ) : (
                    o.thumbnails.map((tn, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={tn.url}
                        alt={tn.alt}
                        className="h-10 w-10 border border-rice bg-white/50 object-cover"
                      />
                    ))
                  )}
                </div>
                <div>
                  <div className="font-display text-[15px] text-ink">
                    {t("order_number", { number: o.publicNumber })}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-mid">
                    {t("order_placed_on", { date: dateFmt.format(o.placedAt) })}
                    {" · "}
                    {t("order_items_count", { count: o.itemCount })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 md:justify-end">
                <OrderStatusPill
                  status={o.status}
                  label={t(`order_status.${o.status as OrderStatusKey}` as const)}
                />
                <div className="font-display text-[15px] text-ink">
                  {formatEur(o.grandTotal, priceLocale(locale))}
                </div>
                <Link
                  href={`/account/orders/${o.publicNumber}`}
                  className="text-[11px] uppercase tracking-label text-ink underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
                >
                  {t("order_view_details")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function EmptyState() {
  const t = await getTranslations("account");
  return (
    <div className="border border-ink/10 bg-white/50 px-8 py-14 text-center">
      <div className="eyebrow">{t("orders_empty_eyebrow")}</div>
      <h2 className="mt-3 font-display text-[24px] leading-tight text-ink">
        {t("orders_empty_title")}
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-ink-mid">
        {t("orders_empty_body")}
      </p>
      <Link
        href="/shop"
        className="mt-6 inline-block h-11 bg-ink px-6 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion leading-[2.75rem]"
      >
        {t("orders_empty_cta")}
      </Link>
    </div>
  );
}

