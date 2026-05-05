// ─────────────────────────────────────────────────────────────────────────
// /admin/loyalty — YU.R Club hub.
//
// Dashboard with the key live numbers (members, points outstanding,
// pending task claims, recent events) plus four big tiles linking to
// the four CRUD surfaces (settings / tiers / rewards / tasks).
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Sparkles, SlidersHorizontal, Layers, Gift, ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth-roles";
import { getLoyaltySettings } from "@/lib/loyalty/settings";
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
  ]);

  const totalOutstanding = pointsAgg._sum.pointsBalance ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">YU.R Club</div>
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
            <table className="w-full text-[13px]">
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
                        {e.createdAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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
            </table>
          </div>
        )}
      </section>
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
