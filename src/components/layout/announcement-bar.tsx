// ─────────────────────────────────────────────────────────────────────────
// AnnouncementBar — slim sitewide strip(s) above the header.
//
// Renders TWO stacked rows:
//   1. Vermilion: free-shipping threshold (reads admin setting)
//   2. Ink (black): YurClub strip — copy switches by auth state:
//        · Signed-out → "Earn points on every order — join free"
//                       (links to sign-up)
//        · Signed-in  → "{N} points in your YU.R Club balance"
//                       (links to /account where the drawer opens)
//
// The signed-in path runs ONE extra cheap query (LoyaltyAccount.pointsBalance
// only) so we don't trigger the heavy drawer-data pipeline on every page
// load. Customer with no LoyaltyAccount row yet falls back to "0 points".
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatEur, priceLocale } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = {
  /** Free-shipping threshold in EUR — passed in from the layout so the
   *  bar reflects whatever Sofia has saved in /admin/settings/shipping. */
  thresholdEur: number;
  /** Active URL locale — needed for currency formatting (€50,00 NL vs
   *  €50.00 EN). Also used by getTranslations below. */
  locale: string;
};

export async function AnnouncementBar({ thresholdEur, locale }: Props) {
  const t = await getTranslations("announcement");
  const user = await getCurrentUser();
  const isLoggedIn = !!user;

  const showShippingRow = thresholdEur > 0;

  // For signed-in customers, look up their cached points balance.
  // Single-column read on a row keyed by userId — cheap.
  let pointsBalance = 0;
  if (isLoggedIn && user) {
    const account = await prisma.loyaltyAccount.findUnique({
      where: { userId: user.id },
      select: { pointsBalance: true },
    });
    pointsBalance = account?.pointsBalance ?? 0;
  }

  const amount = showShippingRow
    ? formatEur(thresholdEur, priceLocale(locale))
    : "";

  return (
    <aside
      role="region"
      aria-label="Site announcements"
      className="relative z-50 w-full"
    >
      {/* Row 1 — free shipping (vermilion / brand red) */}
      {showShippingRow && (
        <div className="bg-vermilion text-rice">
          <div className="container flex items-center justify-center py-2 text-center">
            <span className="text-[10px] uppercase tracking-label sm:text-[11px]">
              {t("free_shipping", { amount })}
            </span>
          </div>
        </div>
      )}

      {/* Row 2 — YurClub strip (ink / black).
          Same visual frame for both auth states; only the inner copy +
          link target change so the bar's height + style stay stable
          across login transitions. */}
      <Link
        href={
          isLoggedIn ? `/${locale}/account` : `/${locale}/sign-up`
        }
        className="group block bg-ink text-rice transition-colors hover:bg-ink/90"
        aria-label={
          isLoggedIn
            ? t("yurclub_balance", { points: pointsBalance })
            : t("yurclub")
        }
      >
        <div className="container flex items-center justify-center gap-2 py-2 text-center">
          <Sparkles className="h-3 w-3 text-gold" aria-hidden />
          <span className="text-[10px] uppercase tracking-label sm:text-[11px]">
            {isLoggedIn
              ? t("yurclub_balance", { points: pointsBalance })
              : t("yurclub")}
          </span>
          <ArrowRight
            className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
      </Link>
    </aside>
  );
}
