// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/club/coupons — every code attached to this customer.
//
// Two tabs (driven by ?tab=available|expired querystring so the URL is
// shareable): Available (currently usable) and Expired (past endsAt OR
// fully redeemed). The redeem flow redirects here with ?redeemed=CODE
// to highlight the freshly minted code at the top.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { ChevronLeft, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/auth";
import { CouponCodeRow } from "./code-row";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; redeemed?: string }>;
};

export const dynamic = "force-dynamic";

export default async function MyCouponsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { tab, redeemed } = await searchParams;
  setRequestLocale(locale);

  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/club/coupons",
  });

  const now = new Date();
  const all = await prisma.coupon.findMany({
    where: { userId: profile.id },
    orderBy: { createdAt: "desc" },
    select: {
      code: true,
      kind: true,
      value: true,
      endsAt: true,
      isActive: true,
      maxRedemptions: true,
      redemptionsUsed: true,
      createdAt: true,
    },
  });

  const isAvailable = (c: (typeof all)[number]) =>
    c.isActive &&
    (c.endsAt === null || c.endsAt > now) &&
    (c.maxRedemptions === null || c.redemptionsUsed < c.maxRedemptions);

  const available = all.filter(isAvailable);
  const expired = all.filter((c) => !isAvailable(c));

  // Default to "available" unless explicit ?tab=expired AND there are
  // expired ones; redirecting feels heavy-handed for a tab toggle.
  const activeTab = tab === "expired" && expired.length > 0 ? "expired" : "available";
  const rows = activeTab === "expired" ? expired : available;

  return (
    <section>
      <Link
        href="/account"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to account
      </Link>

      <h1 className="mt-3 font-display text-display-md leading-tight text-ink md:text-display-lg">
        My coupons
      </h1>
      <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
        Codes minted from loyalty redemptions, welcome rewards and referrals.
        Apply them at checkout. Coupons can't stack on one cart — use them on
        separate orders for the most value.
      </p>

      {redeemed ? (
        <div className="mt-6 border border-vermilion/30 bg-vermilion/5 px-5 py-4">
          <p className="text-[10px] uppercase tracking-label text-vermilion">
            Just redeemed
          </p>
          <div className="mt-1 flex items-center justify-between gap-4">
            <code className="font-mono text-[16px] tracking-[0.16em] text-ink">
              {redeemed}
            </code>
            <span className="text-[12px] text-ink-mid">
              Saved to your codes below.
            </span>
          </div>
        </div>
      ) : null}

      <nav className="mt-8 flex gap-6 border-b border-ink/10 text-[12px] uppercase tracking-label">
        <TabLink href="?tab=available" active={activeTab === "available"}>
          Available {available.length > 0 ? `(${available.length})` : ""}
        </TabLink>
        <TabLink href="?tab=expired" active={activeTab === "expired"}>
          Expired {expired.length > 0 ? `(${expired.length})` : ""}
        </TabLink>
      </nav>

      <div className="mt-6">
        {rows.length === 0 ? (
          <div className="border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-ink-mid" />
            <p className="mt-4 font-display text-[20px] text-ink">
              {activeTab === "expired"
                ? "Nothing expired yet."
                : "No active coupons."}
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
              {activeTab === "expired"
                ? "Codes you don't use in time will land here."
                : "Earn points and redeem them for codes — or refer a friend to get a 5% bonus."}
            </p>
            {activeTab !== "expired" ? (
              <Link
                href="/account/club/redeem"
                className="mt-6 inline-flex items-center gap-2 border border-ink px-4 py-2 text-[12px] uppercase tracking-label text-ink hover:bg-ink hover:text-rice"
              >
                Redeem points
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-ink/10 border border-ink/10 bg-white/60">
            {rows.map((c) => (
              <CouponCodeRow
                key={c.code}
                code={c.code}
                kind={c.kind}
                value={Number(c.value)}
                endsAt={c.endsAt?.toISOString() ?? null}
                redeemed={c.redemptionsUsed > 0}
                expired={
                  c.endsAt !== null && c.endsAt <= now
                }
                highlighted={c.code === redeemed}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={
        "-mb-px border-b-2 pb-3 transition-colors " +
        (active
          ? "border-vermilion text-ink"
          : "border-transparent text-ink-mid hover:text-ink")
      }
    >
      {children}
    </a>
  );
}

