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
import { readLoyaltyAccountSummary } from "@/lib/loyalty/account";
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
  // Each query is isolated so one failing dependency doesn't 500 the whole
  // account home — a brand-new customer post-signup has no orders, no
  // addresses, and no loyalty events, but the row reads must still succeed.
  // If any query throws, we log with a tag (so it shows up in Hostinger
  // logs) and degrade to an empty value instead of crashing.
  const [ordersR, addressesR, glanceR, loyaltyR] = await Promise.allSettled([
    listMyOrders(profile.id),
    listMyAddresses(profile.id),
    getMyAccountGlance(profile.id),
    readLoyaltyAccountSummary(profile.id),
  ]);
  if (ordersR.status === "rejected")
    console.error("[account/page] listMyOrders failed", ordersR.reason);
  if (addressesR.status === "rejected")
    console.error("[account/page] listMyAddresses failed", addressesR.reason);
  if (glanceR.status === "rejected")
    console.error("[account/page] getMyAccountGlance failed", glanceR.reason);
  if (loyaltyR.status === "rejected")
    console.error(
      "[account/page] readLoyaltyAccountSummary failed",
      loyaltyR.reason,
    );
  const orders = ordersR.status === "fulfilled" ? ordersR.value : [];
  const addresses = addressesR.status === "fulfilled" ? addressesR.value : [];
  const glance =
    glanceR.status === "fulfilled"
      ? glanceR.value
      : {
          orderCount: 0,
          lifetimeSpendEur: 0,
          wishlistCount: 0,
          memberSince: null,
        };
  const loyaltySummary =
    loyaltyR.status === "fulfilled" ? loyaltyR.value : null;
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
      {/* Middle cell swapped from "lifetime spend" to live A-Beauty Club
          points — the actionable number for a customer who's already
          decided to come back. Clickable link drops them straight into
          the redeem catalogue so the stat doubles as a CTA. Falls back
          to "0" when the loyalty account hasn't been auto-created yet
          (first-ever account-page render before ensureLoyaltyAccount
          completes). */}
      <dl className="mt-10 grid grid-cols-3 divide-x divide-ink/10 border-y border-ink/10">
        <GlanceStat
          label={t("glance_orders")}
          value={String(glance.orderCount)}
        />
        <GlanceStat
          label={t("glance_points")}
          value={(loyaltySummary?.pointsBalance ?? 0).toLocaleString(
            curLocale,
          )}
          href="/account/club/redeem"
          accent
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

/** Single stat cell in the glance row.
 *
 *  Optional `href` makes the cell clickable — used by the points stat
 *  so the customer can tap into the redeem catalogue without scrolling.
 *  `accent` prints the value in vermilion to flag the actionable cell.
 */
function GlanceStat({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: string;
  href?: string;
  accent?: boolean;
}) {
  const Inner = (
    <>
      <dt className="text-[10px] uppercase tracking-label text-ink-mid">
        {label}
      </dt>
      <dd
        className={
          "font-display text-[24px] leading-none md:text-[28px] " +
          (accent ? "text-vermilion" : "text-ink")
        }
      >
        {value}
      </dd>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group flex flex-col items-start gap-2 px-4 py-5 transition-colors hover:bg-rice-dim/40 md:px-6 md:py-6"
      >
        {Inner}
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 px-4 py-5 md:px-6 md:py-6">
      {Inner}
    </div>
  );
}
