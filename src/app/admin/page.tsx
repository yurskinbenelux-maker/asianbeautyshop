// ─────────────────────────────────────────────────────────────────────────
// /admin — dashboard overview with live analytics.
//
// A calm landing page. Top row = catalogue counters (Products, Categories,
// Orders, Customers). Below = 30-day revenue strip with AOV + order count,
// the order-status breakdown, top 5 sellers, and a couple of "needs you"
// callouts (active orders, pending reviews).
//
// Everything reads from Prisma via getAdminAnalytics() + a small counter
// query. No caching — an admin opens this page when she wants the truth.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  ArrowUpRight,
  Package,
  Tag,
  ShoppingBag,
  Users,
  MessageSquare,
  Clock,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getAdminAnalytics } from "@/lib/queries/admin-analytics";
import { Sparkline } from "@/components/admin/analytics/sparkline";
import { ORDER_STATUS_LABELS } from "@/lib/orders/labels";
import { getVatYtdSnapshot } from "@/lib/queries/vat-ytd";
import { VatYtdWidget } from "@/components/admin/dashboard/vat-ytd-widget";
import { getVisitorCount } from "@/lib/queries/visitor-count";
import { VisitorCountWidget } from "@/components/admin/dashboard/visitor-count-widget";

export const dynamic = "force-dynamic";

type Counter = {
  label: string;
  value: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
};

const EUR = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const EUR_FINE = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

export default async function AdminOverviewPage() {
  // Counters + analytics in parallel.
  const [
    productCount,
    categoryCount,
    orderCount,
    customerCount,
    analytics,
    vatSnapshot,
    visitorCount,
  ] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.category.count(),
    prisma.order.count(),
    prisma.user.count({ where: { role: Role.CUSTOMER, deletedAt: null } }),
    getAdminAnalytics(),
    getVatYtdSnapshot(),
    getVisitorCount(),
  ]);

  const counters: Counter[] = [
    {
      label: "Products",
      value: productCount,
      href: "/admin/products",
      icon: Package,
      hint: "Edit descriptions, prices, and images.",
    },
    {
      label: "Categories",
      value: categoryCount,
      href: "/admin/categories",
      icon: Tag,
      hint: "Organise the shop navigation.",
    },
    {
      label: "Orders",
      value: orderCount,
      href: "/admin/orders",
      icon: ShoppingBag,
      hint: "Track fulfilment and payments.",
    },
    {
      label: "Customers",
      value: customerCount,
      href: "/admin/customers",
      icon: Users,
      hint: "See who's shopping and their notes.",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      {/* masthead */}
      <header className="mb-10">
        <div className="eyebrow">Admin</div>
        <h1 className="mt-2 font-display text-[38px] leading-tight text-ink">
          Overview
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink-mid">
          A quiet place to run the shop. The numbers below cover the last 30
          days; the sidebar opens everything else.
        </p>
      </header>

      {/* counters */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {counters.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.label}
              href={c.href}
              className="group flex flex-col justify-between border border-ink/10 bg-white/60 p-6 transition-colors hover:border-ink/30 hover:bg-white"
            >
              <div className="flex items-start justify-between">
                <Icon className="h-5 w-5 text-ink-mid" />
                <ArrowUpRight className="h-4 w-4 text-ink-mid opacity-0 transition-opacity group-hover:opacity-100" />
              </div>

              <div className="mt-6">
                <div className="font-display text-[40px] leading-none text-ink">
                  {c.value}
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-label text-ink-mid">
                  {c.label}
                </div>
                <div className="mt-3 text-[12px] leading-relaxed text-ink-mid">
                  {c.hint}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Live visitors + VAT YTD tracker — paired strip. Visitors on
          the left, VAT on the right. an admin checks visitors when "is it
          slow?" and VAT when "are we approaching €10k cross-border?". */}
      <section className="mt-14 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <VisitorCountWidget data={visitorCount} />
        <VatYtdWidget snapshot={vatSnapshot} />
      </section>

      {/* revenue + AOV strip */}
      <section className="mt-14 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <article className="border border-ink/10 bg-white/60 p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="eyebrow">Last 30 days · Order ledger</div>
              <div className="mt-2 font-display text-[40px] leading-none text-ink">
                {EUR.format(analytics.revenueCents / 100)}
              </div>
              <div className="mt-2 text-[12px] text-ink-mid">
                {analytics.orderCount} order
                {analytics.orderCount === 1 ? "" : "s"} · avg{" "}
                {EUR_FINE.format(analytics.aovCents / 100)}
              </div>
              {/* Disclose source so it doesn't get confused with the
               *  cross-border VAT YTD tracker above (which reads net
               *  invoices YTD). This is gross order revenue, rolling
               *  30 days — operational glance, not legal. */}
              <p className="mt-2 text-[11px] text-ink-mid">
                Rolling 30 days · gross order revenue, pre-refund
              </p>
            </div>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
            >
              Open orders
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-6 text-ink">
            <Sparkline
              points={analytics.daily.map((d) => ({
                label: d.date,
                value: d.revenueCents,
              }))}
              height={90}
            />
          </div>

          <div className="mt-3 flex justify-between text-[10px] uppercase tracking-label text-ink-mid">
            <span>{formatDayLabel(analytics.daily[0]?.date)}</span>
            <span>Today</span>
          </div>
        </article>

        <aside className="space-y-4">
          <NeedsAttentionCard
            icon={Clock}
            label="Active orders"
            value={analytics.activeOrdersCount}
            hint="Paid, fulfilling, or shipped"
            href="/admin/orders"
          />
          <NeedsAttentionCard
            icon={MessageSquare}
            label="Pending reviews"
            value={analytics.pendingReviewsCount}
            hint="Waiting for moderation"
            href="/admin/reviews"
          />
        </aside>
      </section>

      {/* status breakdown + top sellers */}
      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <article className="border border-ink/10 bg-white/60 p-8">
          <div className="eyebrow">Order status</div>
          <h2 className="mt-2 font-display text-[20px] text-ink">
            Where things are sitting
          </h2>

          {analytics.statusBreakdown.length === 0 ? (
            <p className="mt-6 text-[13px] text-ink-mid">No orders yet.</p>
          ) : (
            <ul className="mt-6 space-y-3">
              {analytics.statusBreakdown.map((s) => {
                const total =
                  analytics.statusBreakdown.reduce((acc, x) => acc + x.count, 0) ||
                  1;
                const pct = Math.round((s.count / total) * 100);
                return (
                  <li key={s.status}>
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span className="text-ink">
                        {ORDER_STATUS_LABELS[s.status] ?? s.status}
                      </span>
                      <span className="text-ink-mid">
                        {s.count} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-[3px] overflow-hidden bg-ink/5">
                      <div
                        className="h-full bg-ink"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        <article className="border border-ink/10 bg-white/60 p-8">
          <div className="eyebrow">Top sellers · 30d</div>
          <h2 className="mt-2 font-display text-[20px] text-ink">
            What's moving
          </h2>

          {analytics.topSellers.length === 0 ? (
            <p className="mt-6 text-[13px] text-ink-mid">
              Once orders start coming in, your best-selling products appear
              here.
            </p>
          ) : (
            <ol className="mt-6 space-y-3 text-[13px]">
              {analytics.topSellers.map((t, i) => (
                <li
                  key={t.productId}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="w-5 font-display text-[14px] text-ink-mid">
                      {i + 1}
                    </span>
                    <Link
                      href={`/admin/products/${t.productId}`}
                      className="text-ink underline-offset-4 hover:underline"
                    >
                      {t.name}
                    </Link>
                  </div>
                  <div className="text-right">
                    <div className="text-ink">{t.units} sold</div>
                    <div className="text-[11px] text-ink-mid">
                      {EUR.format(t.revenueCents / 100)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>

      {/* quick start */}
      <section className="mt-14">
        <div className="eyebrow">Quick start</div>
        <h2 className="mt-2 font-display text-[24px] text-ink">
          A few things you can do right now
        </h2>

        <ol className="mt-6 space-y-4 text-[14px] leading-relaxed text-ink-mid">
          <li className="flex gap-4 border-l border-ink/10 pl-4">
            <span className="font-display text-[14px] text-ink">01</span>
            <div>
              <div className="text-ink">Review your product catalogue.</div>
              <div className="mt-1">
                Open{" "}
                <Link
                  href="/admin/products"
                  className="underline decoration-vermilion underline-offset-4 hover:text-vermilion"
                >
                  Products
                </Link>{" "}
                to edit names, prices, or hide anything that's not ready.
              </div>
            </div>
          </li>

          <li className="flex gap-4 border-l border-ink/10 pl-4">
            <span className="font-display text-[14px] text-ink">02</span>
            <div>
              <div className="text-ink">Update the homepage bestsellers.</div>
              <div className="mt-1">
                Mark products as bestsellers from the product edit page —
                they'll appear on the homepage in the order you choose.
              </div>
            </div>
          </li>

          <li className="flex gap-4 border-l border-ink/10 pl-4">
            <span className="font-display text-[14px] text-ink">03</span>
            <div>
              <div className="text-ink">Preview the live site.</div>
              <div className="mt-1">
                Use "View live site" in the sidebar to open the customer-facing
                shop in a new tab.
              </div>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}

function NeedsAttentionCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-4 border border-ink/10 bg-white/60 p-5 transition-colors hover:border-ink/30 hover:bg-white"
    >
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="mt-2 font-display text-[28px] leading-none text-ink">
          {value}
        </div>
        <div className="mt-1 text-[11px] text-ink-mid">{hint}</div>
      </div>
      <ArrowUpRight className="mt-1 h-4 w-4 text-ink-mid" />
    </Link>
  );
}

function formatDayLabel(ymd: string | undefined): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
