// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account — overview panel.
//
// Layout (top to bottom):
//   · Greeting with member-since footnote
//   · Glance stats strip (orders · lifetime spend · wishlist)
//   · Recent orders (up to 3) with coloured status pills
//   · Default shipping address
//
// Empty states are editorial: a light card with an eyebrow, headline, and
// CTA — matches the wishlist's empty state so the account area feels
// consistent instead of dropping into plain paragraphs.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { requireCustomer } from "@/lib/auth";
import { listMyOrders, getMyAccountGlance } from "@/lib/queries/orders";
import { listMyAddresses } from "@/lib/queries/addresses";
import { formatEur, priceLocale } from "@/lib/utils";
import {
  OrderStatusPill,
  type OrderStatusKey,
} from "@/components/account/order-status-pill";

type Props = { params: Promise<{ locale: string }> };

export default async function AccountOverviewPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account",
  });

  const t = await getTranslations("account");
  const [orders, addresses, glance] = await Promise.all([
    listMyOrders(profile.id),
    listMyAddresses(profile.id),
    getMyAccountGlance(profile.id),
  ]);
  const recentOrders = orders.slice(0, 3);
  const defaultAddress =
    addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  const curLocale = priceLocale(locale);
  const dateFmt = new Intl.DateTimeFormat(curLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const monthYearFmt = new Intl.DateTimeFormat(curLocale, {
    month: "long",
    year: "numeric",
  });

  const greeting = profile.firstName
    ? t("greeting", { name: profile.firstName })
    : t("greeting_fallback");

  return (
    <section>
      {/* ── header ──────────────────────────────────────────────── */}
      <div className="eyebrow">{t("overview_title")}</div>
      <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
        {greeting}
      </h1>
      {glance.memberSince && (
        <p className="mt-3 text-[12px] uppercase tracking-label text-ink-mid">
          {t("member_since", { date: monthYearFmt.format(glance.memberSince) })}
        </p>
      )}

      {/* ── glance stats ────────────────────────────────────────── */}
      <dl className="mt-10 grid grid-cols-3 divide-x divide-ink/10 border-y border-ink/10">
        <GlanceStat
          label={t("glance_orders")}
          value={String(glance.orderCount)}
        />
        <GlanceStat
          label={t("glance_spend")}
          value={formatEur(glance.lifetimeSpendEur, curLocale)}
        />
        <GlanceStat
          label={t("glance_wishlist")}
          value={String(glance.wishlistCount)}
        />
      </dl>

      <div className="rule my-12" />

      {/* ── recent orders ───────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[22px] leading-tight text-ink">
            {t("overview_recent_orders")}
          </h2>
          {orders.length > 0 && (
            <Link
              href="/account/orders"
              className="text-[11px] uppercase tracking-label text-ink-mid underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
            >
              {t("overview_view_all_orders")}
            </Link>
          )}
        </div>

        {recentOrders.length === 0 ? (
          // Editorial empty state — replaces the bare paragraph we had
          // before. Matches the wishlist empty-state treatment.
          <div className="mt-8 border border-ink/10 bg-white/50 px-8 py-12 text-center">
            <div className="eyebrow">{t("overview_empty_orders_eyebrow")}</div>
            <h3 className="mt-3 font-display text-[22px] leading-tight text-ink">
              {t("overview_empty_orders_title")}
            </h3>
            <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-ink-mid">
              {t("overview_empty_orders_body")}
            </p>
            <Link
              href="/shop"
              className="mt-6 inline-block h-11 bg-ink px-6 text-[12px] uppercase tracking-label leading-[2.75rem] text-rice transition-colors hover:bg-vermilion"
            >
              {t("overview_empty_orders_cta")}
            </Link>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
            {recentOrders.map((o) => (
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
                    {formatEur(o.grandTotal, curLocale)}
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
      </div>

      <div className="rule my-12" />

      {/* ── default address ─────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[22px] leading-tight text-ink">
            {t("overview_default_address")}
          </h2>
          <Link
            href="/account/addresses"
            className="text-[11px] uppercase tracking-label text-ink-mid underline decoration-vermilion underline-offset-4 transition-colors hover:text-vermilion"
          >
            {t("overview_manage_addresses")}
          </Link>
        </div>

        {!defaultAddress ? (
          <div className="mt-8 border border-ink/10 bg-white/50 px-8 py-12 text-center">
            <div className="eyebrow">
              {t("overview_empty_address_eyebrow")}
            </div>
            <h3 className="mt-3 font-display text-[22px] leading-tight text-ink">
              {t("overview_empty_address_title")}
            </h3>
            <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-ink-mid">
              {t("overview_empty_address_body")}
            </p>
            <Link
              href="/account/addresses/new"
              className="mt-6 inline-block h-11 bg-ink px-6 text-[12px] uppercase tracking-label leading-[2.75rem] text-rice transition-colors hover:bg-vermilion"
            >
              {t("overview_empty_address_cta")}
            </Link>
          </div>
        ) : (
          <address className="mt-6 not-italic text-[14px] leading-relaxed text-ink">
            <div>
              {defaultAddress.firstName} {defaultAddress.lastName}
            </div>
            {defaultAddress.company && <div>{defaultAddress.company}</div>}
            <div>{defaultAddress.line1}</div>
            {defaultAddress.line2 && <div>{defaultAddress.line2}</div>}
            <div>
              {defaultAddress.postcode} {defaultAddress.city}
              {defaultAddress.region ? `, ${defaultAddress.region}` : ""}
            </div>
            <div className="uppercase tracking-wide">
              {defaultAddress.country}
            </div>
            {defaultAddress.phone && (
              <div className="mt-1 text-ink-mid">{defaultAddress.phone}</div>
            )}
          </address>
        )}
      </div>
    </section>
  );
}

/** Single stat cell in the glance row. Purely presentational. */
function GlanceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-5 md:px-6 md:py-6">
      <dt className="text-[10px] uppercase tracking-label text-ink-mid">
        {label}
      </dt>
      <dd className="font-display text-[24px] leading-none text-ink md:text-[28px]">
        {value}
      </dd>
    </div>
  );
}
