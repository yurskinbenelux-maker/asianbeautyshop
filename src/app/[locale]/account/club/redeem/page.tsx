// ─────────────────────────────────────────────────────────────────────────
// /[locale]/account/club/redeem — full reward catalogue.
//
// The drawer shows the top few; this page shows everything. Each card
// links to the per-id confirmation page rather than redeeming inline,
// so a misclick costs nothing.
// ─────────────────────────────────────────────────────────────────────────

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Locale } from "@prisma/client";
import { Sparkles, ChevronLeft, Lock } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { listRedeemableRewards } from "@/lib/loyalty/redeem";
import { ensureLoyaltyAccount } from "@/lib/loyalty/account";

type Props = { params: Promise<{ locale: string }> };

export const dynamic = "force-dynamic";

function toPrismaLocale(s: string): Locale {
  switch (s.toLowerCase()) {
    case "nl": return Locale.NL;
    case "fr": return Locale.FR;
    case "ru": return Locale.RU;
    default:   return Locale.EN;
  }
}

export default async function RedeemCataloguePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { profile } = await requireCustomer({
    locale,
    redirectTo: "/account/club/redeem",
  });

  const account = await ensureLoyaltyAccount({
    userId: profile.id,
    firstName: profile.firstName,
  });
  const rewards = await listRedeemableRewards({
    userId: profile.id,
    locale: toPrismaLocale(locale),
  });

  const t = await getTranslations("yur_club");

  return (
    <section>
      <Link
        href="/account"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to account
      </Link>
      <div className="mt-3 flex items-baseline justify-between gap-6">
        <div>
          <div className="eyebrow text-vermilion">{t("eyebrow")}</div>
          <h1 className="mt-2 font-display text-display-md leading-tight text-ink md:text-display-lg">
            {t("section_redeem_ways")}
          </h1>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-label text-ink-mid">
            {t("points")}
          </p>
          <p className="font-display text-[32px] leading-none text-ink">
            {account.pointsBalance.toLocaleString()}
          </p>
        </div>
      </div>

      {rewards.length === 0 ? (
        <div className="mt-12 border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-ink-mid" />
          <p className="mt-4 font-display text-[20px] text-ink">
            Rewards coming soon
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
            an admin is curating what you can spend points on. Check back shortly.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {rewards.map((r) => (
            <li key={r.id}>
              <Link
                href={
                  r.affordable
                    ? `/account/club/redeem/${r.id}`
                    : "/account/club/redeem"
                }
                aria-disabled={!r.affordable}
                className={
                  "group block border bg-white/60 p-5 transition-colors " +
                  (r.affordable
                    ? "border-ink/10 hover:border-vermilion/40"
                    : "pointer-events-none border-ink/10 opacity-60")
                }
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-label text-ink-mid">
                      {r.valueLabel}
                    </p>
                    <h3 className="mt-1 font-display text-[18px] leading-tight text-ink">
                      {r.title}
                    </h3>
                    {r.description ? (
                      <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
                        {r.description}
                      </p>
                    ) : null}
                  </div>
                  {!r.affordable ? (
                    <Lock className="h-4 w-4 shrink-0 text-ink-mid" aria-hidden />
                  ) : null}
                </div>
                <div className="mt-4 flex items-baseline justify-between border-t border-ink/10 pt-3">
                  <span className="font-display text-[16px] text-vermilion">
                    {r.pointsCost.toLocaleString()} pts
                  </span>
                  <span className="text-[11px] uppercase tracking-label text-ink-mid transition-colors group-hover:text-vermilion">
                    {r.affordable ? "Redeem →" : `${(r.pointsCost - account.pointsBalance).toLocaleString()} pts to go`}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
