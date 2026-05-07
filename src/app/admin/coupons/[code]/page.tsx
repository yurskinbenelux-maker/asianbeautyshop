import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getAdminCoupon,
  getCouponAnalytics,
} from "@/lib/queries/admin-coupons";
import { CouponForm } from "@/components/admin/coupons/coupon-form";
import { CouponDangerZone } from "@/components/admin/coupons/coupon-danger-zone";
import { formatDiscount, formatWindow } from "../format";

export const dynamic = "force-dynamic";

export default async function EditCouponPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: codeRaw } = await params;
  const code = decodeURIComponent(codeRaw).toUpperCase();
  // Fetch the coupon + its analytics in parallel — two separate Prisma
  // queries, but they don't depend on each other so we can overlap them.
  const [coupon, analytics] = await Promise.all([
    getAdminCoupon(code),
    getCouponAnalytics(code),
  ]);
  if (!coupon) notFound();

  const EUR = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  });

  const DATETIME = new Intl.DateTimeFormat("en-IE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <Link
        href="/admin/coupons"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Coupons
      </Link>

      <header className="mt-6 mb-10 flex flex-wrap items-end gap-6">
        <div>
          <div className="eyebrow">Coupon</div>
          <h1 className="mt-2 font-mono text-[30px] leading-tight text-ink">
            {coupon.code}
          </h1>
          <p className="mt-2 text-[13px] text-ink-mid">
            {formatDiscount(coupon)} · {formatWindow(coupon.startsAt, coupon.endsAt)}
          </p>
        </div>
        <div className="ml-auto grid grid-cols-2 gap-6 text-[12px]">
          <Metric label="Redemptions" value={String(coupon.redemptionsUsed)} />
          <Metric
            label="Cap"
            value={coupon.maxRedemptions ? String(coupon.maxRedemptions) : "—"}
          />
        </div>
      </header>

      {/*
        Performance strip — derived from real Order rows (cancelled orders
        excluded) rather than Coupon.redemptionsUsed. The counter in the
        masthead above shows the raw checkout increment; this block tells
        an admin whether the promo actually made money.
      */}
      <section className="mb-10 border border-ink/10 bg-white/60">
        <div className="flex items-center justify-between gap-4 border-b border-ink/10 px-6 py-4">
          <div className="eyebrow">Performance</div>
          <div className="text-[11px] uppercase tracking-label text-ink-mid">
            {analytics.lastUsedAt
              ? `Last used ${DATETIME.format(analytics.lastUsedAt)}`
              : "Never used"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-ink/5 md:grid-cols-4">
          <AnalyticsTile
            label="Real redemptions"
            value={String(analytics.redemptionsCount)}
            helper={
              coupon.redemptionsUsed !== analytics.redemptionsCount
                ? `counter: ${coupon.redemptionsUsed}`
                : "cancelled excluded"
            }
          />
          <AnalyticsTile
            label="Revenue attributed"
            value={EUR.format(analytics.attributedRevenueCents / 100)}
            helper="grand total of matched orders"
          />
          <AnalyticsTile
            label="Discount given"
            value={EUR.format(analytics.discountGivenCents / 100)}
            helper="order-level discount total"
          />
          <AnalyticsTile
            label="Avg. order"
            value={
              analytics.redemptionsCount
                ? EUR.format(analytics.averageOrderCents / 100)
                : "—"
            }
            helper={
              analytics.redemptionsCount
                ? "per redemption"
                : "no redemptions yet"
            }
          />
        </div>

        {/* Top five products redeemed with this code */}
        <div className="border-t border-ink/10 px-6 py-5">
          <div className="text-[11px] uppercase tracking-label text-ink-mid">
            Top products redeemed
          </div>
          {analytics.topProducts.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-ink-mid">
              No products yet — this code hasn&apos;t been applied to a
              completed order.
            </p>
          ) : (
            <ol className="mt-3 space-y-2 text-[13px]">
              {analytics.topProducts.map((p, i) => (
                <li
                  key={p.productId}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="font-mono text-[11px] text-ink-mid">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Link
                      href={`/admin/products/${p.productId}`}
                      className="truncate text-ink underline-offset-4 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </div>
                  <div className="flex items-center gap-6 text-ink-mid">
                    <span className="tabular-nums">
                      {p.quantity} {p.quantity === 1 ? "unit" : "units"}
                    </span>
                    <span className="tabular-nums text-ink">
                      {EUR.format(p.revenueCents / 100)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div>
          <CouponForm
            mode="edit"
            initial={{
              code: coupon.code,
              kind: coupon.kind,
              value: coupon.value,
              minSubtotalCents: coupon.minSubtotalCents,
              maxRedemptions: coupon.maxRedemptions,
              startsAt: coupon.startsAt,
              endsAt: coupon.endsAt,
              isActive: coupon.isActive,
              firstOrderOnly: coupon.firstOrderOnly,
            }}
          />

          <div className="mt-12">
            <CouponDangerZone
              code={coupon.code}
              redemptionsUsed={coupon.redemptionsUsed}
            />
          </div>
        </div>

        <aside>
          <div className="border border-ink/10 bg-white/60 p-6">
            <div className="eyebrow">Recent orders</div>
            {coupon.recentOrders.length === 0 ? (
              <p className="mt-4 text-[12px] text-ink-mid">
                No orders have used this code yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-3 text-[13px]">
                {coupon.recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono text-ink underline-offset-4 hover:underline"
                    >
                      {o.publicNumber}
                    </Link>
                    <span className="text-ink-mid">
                      {EUR.format(o.grandTotalCents / 100)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-label text-ink-mid">
        {label}
      </div>
      <div className="mt-1 font-display text-[22px] leading-none text-ink">
        {value}
      </div>
    </div>
  );
}

/** Larger stat tile used inside the Performance strip. */
function AnalyticsTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="bg-white px-6 py-5">
      <div className="text-[10px] uppercase tracking-label text-ink-mid">
        {label}
      </div>
      <div className="mt-2 font-display text-[24px] leading-none text-ink tabular-nums">
        {value}
      </div>
      {helper && (
        <div className="mt-1 text-[11px] text-ink-mid">{helper}</div>
      )}
    </div>
  );
}
