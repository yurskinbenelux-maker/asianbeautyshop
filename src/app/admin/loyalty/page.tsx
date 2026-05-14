// ─────────────────────────────────────────────────────────────────────────
// /admin/loyalty — A-Beauty Club hub.
//
// Dashboard with the key live numbers (members, points outstanding,
// pending task claims, recent events) plus four big tiles linking to
// the four CRUD surfaces (settings / tiers / rewards / tasks).
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  Sparkles,
  SlidersHorizontal,
  Layers,
  Gift,
  ListChecks,
  ArrowDownLeft,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";
import { getLoyaltySettings } from "@/lib/loyalty/settings";
import { formatAdminDateTime } from "@/lib/utils/format-date";
import {
  LoyaltyEventKind,
  LoyaltyTaskClaimStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<LoyaltyEventKind, string> = {
  EARNED_ORDER: "Order",
  EARNED_BIRTHDAY: "Birthday",
  EARNED_TASK: "Task",
  EARNED_MILESTONE: "Milestone",
  EARNED_REFERRAL: "Referral",
  REFERRAL_BONUS: "Referral (legacy)",
  REDEEMED_COUPON: "Redeemed coupon",
  REDEEMED_PRODUCT: "Redeemed product",
  REDEEMED_GIFT_CARD: "Redeemed gift card",
  ADJUSTED_ADMIN: "Adjusted",
  REVERSED_REFUND: "Refund clawback",
  EXPIRED: "Expired",
};

export default async function AdminLoyaltyHubPage() {
  await requireCapability("loyalty.edit");

  const [
    settings,
    memberCount,
    pointsAgg,
    pendingClaims,
    recentEvents,
    recentReversals,
  ] = await Promise.all([
    getLoyaltySettings(),
    prisma.loyaltyAccount.count(),
    prisma.loyaltyAccount.aggregate({ _sum: { pointsBalance: true } }),
    prisma.loyaltyTaskClaim.count({
      where: { status: LoyaltyTaskClaimStatus.PENDING },
    }),
    prisma.loyaltyEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        kind: true,
        delta: true,
        reason: true,
        createdAt: true,
        account: {
          select: { user: { select: { email: true } } },
        },
      },
    }),
    // G10 — refund clawbacks audit log. Pulls the most recent
    // REVERSED_REFUND events with enough context (order number,
    // return reference, customer email) for admins to answer
    // "why did I lose points?" support tickets without grepping
    // the DB. Limited to 25 because that covers ~1 month at any
    // realistic shop volume; older history lives in the customer
    // detail page when we eventually expose it there.
    prisma.loyaltyEvent.findMany({
      where: { kind: LoyaltyEventKind.REVERSED_REFUND },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        delta: true,
        reason: true,
        createdAt: true,
        orderId: true,
        returnId: true,
        account: {
          select: { user: { select: { email: true } } },
        },
      },
    }),
  ]);

  const totalOutstanding = pointsAgg._sum.pointsBalance ?? 0;

  // Resolve order + return public numbers for the reversal log. Done
  // with two fan-out queries instead of per-row lookups so the page
  // stays sub-50ms even at 25 rows. LoyaltyEvent.orderId/returnId are
  // bare String FKs (no Prisma relation) so we can't include them
  // directly — these batched lookups take their place.
  const reversalOrderIds = Array.from(
    new Set(
      recentReversals
        .map((r) => r.orderId)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const reversalReturnIds = Array.from(
    new Set(
      recentReversals
        .map((r) => r.returnId)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const [orderLookups, returnLookups] = await Promise.all([
    reversalOrderIds.length
      ? prisma.order.findMany({
          where: { id: { in: reversalOrderIds } },
          select: { id: true, publicNumber: true },
        })
      : Promise.resolve([]),
    reversalReturnIds.length
      ? prisma.returnRequest.findMany({
          where: { id: { in: reversalReturnIds } },
          select: { id: true, publicNumber: true },
        })
      : Promise.resolve([]),
  ]);
  const orderNumberById = new Map(
    orderLookups.map((o) => [o.id, o.publicNumber]),
  );
  const returnNumberById = new Map(
    returnLookups.map((r) => [r.id, r.publicNumber]),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">A-Beauty Club</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            Loyalty programme
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            Tweak every economic lever from here. Changes apply immediately —
            existing balances are never altered when you change rules.
          </p>
        </div>
        <span
          className={
            "inline-flex items-center gap-1.5 px-3 py-1 text-[11px] uppercase tracking-label " +
            (settings.isProgramActive
              ? "bg-sage/10 text-sage"
              : "bg-ink/5 text-ink-mid")
          }
        >
          <span
            className={
              "h-1.5 w-1.5 rounded-full " +
              (settings.isProgramActive ? "bg-sage" : "bg-ink-mid")
            }
          />
          {settings.isProgramActive ? "Active" : "Paused"}
        </span>
      </header>

      {/* numbers */}
      <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Members" value={memberCount.toLocaleString()} />
        <Stat
          label="Points outstanding"
          value={totalOutstanding.toLocaleString()}
        />
        <Stat label="Pending task claims" value={pendingClaims.toLocaleString()} />
        <Stat
          label="Points per €1"
          value={settings.pointsPerEur.toString()}
        />
      </div>

      {/* tiles */}
      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2">
        <HubTile
          href="/admin/loyalty/settings"
          icon={SlidersHorizontal}
          title="Settings"
          body="Pts per euro, birthday bonus, milestone cadence, referral rules, expiry windows."
        />
        <HubTile
          href="/admin/loyalty/tiers"
          icon={Layers}
          title="Tiers"
          body="Bud, Bloom, Aurora, Atelier — rename, reorder, add new ones, set thresholds."
        />
        <HubTile
          href="/admin/loyalty/rewards"
          icon={Gift}
          title="Ways to redeem"
          body="Products, gift cards, fixed-amount and percent discount codes — each with a points cost."
        />
        <HubTile
          href="/admin/loyalty/tasks"
          icon={ListChecks}
          title="Ways to earn"
          body="Place an order, share on Instagram, leave a review — everything besides automatic accrual."
        />
      </div>

      {/* activity feed */}
      <section>
        <h2 className="eyebrow mb-3">Recent activity</h2>
        {recentEvents.length === 0 ? (
          <div className="border border-dashed border-ink/15 bg-white/40 px-6 py-10 text-center">
            <Sparkles className="mx-auto h-5 w-5 text-ink-mid" />
            <p className="mt-3 text-[13px] text-ink-mid">
              No points activity yet. Once your first paid order lands, accrual
              fires automatically.
            </p>
          </div>
        ) : (
          <div className="border border-ink/10 bg-white/60">
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]">
              <thead className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((e) => {
                  const positive = e.delta >= 0;
                  return (
                    <tr key={e.id} className="border-b border-ink/5 last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-3 align-middle text-ink-mid">
                        {formatAdminDateTime(e.createdAt)}
                      </td>
                      <td className="px-4 py-3 align-middle text-ink">
                        {e.account?.user?.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-middle text-ink-mid">
                        {e.reason}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="text-[10px] uppercase tracking-label text-ink-mid">
                          {KIND_LABEL[e.kind]}
                        </span>
                      </td>
                      <td
                        className={
                          "whitespace-nowrap px-4 py-3 text-right align-middle font-display text-[15px] " +
                          (positive ? "text-vermilion" : "text-ink-mid")
                        }
                      >
                        {positive ? "+" : ""}
                        {e.delta.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        )}
      </section>

      {/* G10 — refund clawbacks audit log.
       *
       * Surfaced as a distinct section (not folded into the main feed)
       * because the support-question pattern is "find the reversal for
       * this customer/order" — having it in its own table with order +
       * return columns makes that a one-glance lookup. Only renders
       * when there's actually been a reversal; an empty section would
       * just be visual noise pre-launch. */}
      {recentReversals.length > 0 ? (
        <section className="mt-10">
          <h2 className="eyebrow mb-3 flex items-center gap-2">
            <ArrowDownLeft className="h-3.5 w-3.5 text-vermilion" aria-hidden />
            Refund clawbacks
          </h2>
          <p className="mb-3 text-[12px] text-ink-mid">
            Points removed from a customer when their order was refunded.
            Proportional to refund amount — see each row for the math.
          </p>
          <div className="border border-ink/10 bg-white/60">
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]">
              <thead className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Return</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {recentReversals.map((r) => {
                  const orderNumber = r.orderId
                    ? orderNumberById.get(r.orderId)
                    : null;
                  const returnNumber = r.returnId
                    ? returnNumberById.get(r.returnId)
                    : null;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-ink/5 last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3 align-middle text-ink-mid">
                        {formatAdminDateTime(r.createdAt)}
                      </td>
                      <td className="px-4 py-3 align-middle text-ink">
                        {r.account?.user?.email ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle font-mono text-[12px] text-ink">
                        {orderNumber ? (
                          <Link
                            href={`/admin/orders/${r.orderId}`}
                            className="underline decoration-ink/20 underline-offset-4 hover:decoration-vermilion"
                          >
                            {orderNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle font-mono text-[12px] text-ink-mid">
                        {returnNumber ? (
                          <Link
                            href={`/admin/returns/${r.returnId}`}
                            className="underline decoration-ink/20 underline-offset-4 hover:decoration-vermilion"
                          >
                            {returnNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-ink-mid">
                        {r.reason}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right align-middle font-display text-[15px] text-vermilion">
                        {r.delta.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink/10 bg-white/60 px-5 py-4">
      <p className="text-[10px] uppercase tracking-label text-ink-mid">{label}</p>
      <p className="mt-1 font-display text-[26px] leading-none text-ink">{value}</p>
    </div>
  );
}

function HubTile({
  href,
  icon: Icon,
  title,
  body,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group block border border-ink/10 bg-white/60 p-5 transition-colors hover:border-vermilion/40"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-vermilion" />
        <h3 className="font-display text-[18px] text-ink">{title}</h3>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">{body}</p>
      <span className="mt-3 inline-block text-[11px] uppercase tracking-label text-ink-mid transition-colors group-hover:text-vermilion">
        Open →
      </span>
    </Link>
  );
}
