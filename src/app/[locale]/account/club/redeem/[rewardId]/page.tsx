// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/club/redeem/[rewardId] — confirmation page.
//
// Shows the cost, what they get, and a single confirm button. Submission
// burns the points and redirects to /account/club/coupons?redeemed=CODE
// where the freshly minted code is highlighted.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/routing";
import { Locale } from "@prisma/client";
import { ChevronLeft } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { getRedeemableReward } from "@/lib/loyalty/redeem";
import { ensureLoyaltyAccount } from "@/lib/loyalty/account";
import { ConfirmRedeemButton } from "./confirm-button";

type Props = {
  params: Promise<{ locale: string; rewardId: string }>;
};

export const dynamic = "force-dynamic";

function toPrismaLocale(s: string): Locale {
  switch (s.toLowerCase()) {
    case "nl": return Locale.NL;
    case "fr": return Locale.FR;
    case "ru": return Locale.RU;
    default:   return Locale.EN;
  }
}

export default async function ConfirmRedeemPage({ params }: Props) {
  const { locale, rewardId } = await params;
  setRequestLocale(locale);

  const { profile } = await requireCustomer({
    locale,
    redirectTo: `/account/club/redeem/${rewardId}`,
  });

  const reward = await getRedeemableReward({
    rewardId,
    userId: profile.id,
    locale: toPrismaLocale(locale),
  });
  if (!reward) redirect(`/${locale}/account/club/redeem`);

  const account = await ensureLoyaltyAccount({
    userId: profile.id,
    firstName: profile.firstName,
  });

  const balanceAfter = account.pointsBalance - reward.pointsCost;

  return (
    <section className="mx-auto max-w-xl">
      <Link
        href="/account/club/redeem"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        All rewards
      </Link>

      <div className="mt-6 border border-ink/10 bg-white px-8 py-10">
        <p className="text-[10px] uppercase tracking-label text-vermilion">
          {reward.valueLabel}
        </p>
        <h1 className="mt-2 font-display text-[32px] leading-tight text-ink">
          {reward.title}
        </h1>
        {reward.description ? (
          <p className="mt-3 text-[14px] leading-relaxed text-ink-mid">
            {reward.description}
          </p>
        ) : null}

        <dl className="mt-8 space-y-3 border-y border-ink/10 py-5 text-[13px]">
          <Row label="Cost" value={`${reward.pointsCost.toLocaleString()} pts`} accent />
          <Row label="Your current balance" value={`${account.pointsBalance.toLocaleString()} pts`} />
          <Row
            label="Balance after redemption"
            value={
              reward.affordable
                ? `${balanceAfter.toLocaleString()} pts`
                : `Not enough — need ${(reward.pointsCost - account.pointsBalance).toLocaleString()} more`
            }
            negative={!reward.affordable}
          />
        </dl>

        <p className="mt-6 text-[12px] leading-relaxed text-ink-mid">
          On confirmation we'll mint a single-use code (valid for 90 days) and
          deduct the points immediately. You can find every code under
          {" "}
          <Link
            href="/account/club/coupons"
            className="text-ink underline underline-offset-[3px]"
          >
            My coupons
          </Link>
          . You'll get a reminder email before it expires.
        </p>

        <div className="mt-8">
          <ConfirmRedeemButton
            locale={locale}
            rewardId={reward.id}
            disabled={!reward.affordable}
          />
        </div>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  accent,
  negative,
}: {
  label: string;
  value: string;
  accent?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="text-ink-mid">{label}</dt>
      <dd
        className={
          accent
            ? "font-display text-[16px] text-vermilion"
            : negative
              ? "text-vermilion"
              : "text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
