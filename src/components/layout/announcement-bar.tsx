// ─────────────────────────────────────────────────────────────────────────
// AnnouncementBar — slim sitewide strip(s) above the header.
//
// Currently renders TWO stacked rows:
//   1. Vermilion: free-shipping threshold (reads admin setting)
//   2. Ink (black): YurClub teaser — earn points on every order, links
//      through to the sign-up page.
//
// Both rows are server-rendered. The free-shipping row hides itself if
// the threshold is 0 (always-free campaigns); the YurClub row hides for
// already-signed-in customers since they're already members.
//
// Accessibility:
//   · Wrapper is <aside role="region"> with a single landmark name
//     ("Site announcements") so screen readers see one bar, not two.
//   · The YurClub row is a real <a> so it's keyboard-reachable + the
//     whole strip is clickable, not just the button.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatEur, priceLocale } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";

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

  // Don't render anything if both rows would be empty.
  if (!showShippingRow && isLoggedIn) return null;

  const amount = showShippingRow
    ? formatEur(thresholdEur, priceLocale(locale))
    : "";

  return (
    <aside
      role="region"
      aria-label="Site announcements"
      // The wrapper sets z-index + width; each row applies its own bg.
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

      {/* Row 2 — YurClub teaser (ink / black). Hidden for signed-in
          users since they're already members. */}
      {!isLoggedIn && (
        <Link
          href={`/${locale}/sign-up`}
          // group-style link so the arrow nudges on hover. The whole
          // strip is the click target — easier on mobile than tapping
          // a small text link.
          className="group block bg-ink text-rice transition-colors hover:bg-ink/90"
          aria-label={t("yurclub")}
        >
          <div className="container flex items-center justify-center gap-2 py-2 text-center">
            <Sparkles className="h-3 w-3 text-gold" aria-hidden />
            <span className="text-[10px] uppercase tracking-label sm:text-[11px]">
              {t("yurclub")}
            </span>
            <ArrowRight
              className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden
            />
          </div>
        </Link>
      )}
    </aside>
  );
}
