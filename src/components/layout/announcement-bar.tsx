// ─────────────────────────────────────────────────────────────────────────
// AnnouncementBar — slim sitewide strip above the header.
//
// Currently surfaces the free-shipping threshold only. Sits above the
// nav (so the nav itself doesn't visually shift when the bar updates)
// and renders fully server-side — the threshold and locale come from
// the layout, no React state involved.
//
// Why a single-purpose component now:
//   · Sofia asked for a "From €50, delivery is free" banner specifically
//   · Keeping the component dedicated avoids prematurely abstracting a
//     generic announcement system (slot for promos, holidays, etc.)
//   · When the time comes for a multi-message rotator, this file can be
//     swapped out without touching the layout.
//
// Accessibility notes:
//   · Wrapped in an <aside role="status"> so screen readers can pick it
//     up at page load but don't announce it as a navigation landmark.
//   · `aria-label` describes its purpose so a JAWS user lands here and
//     knows it's brand info, not interactive.
// ─────────────────────────────────────────────────────────────────────────

import { getTranslations } from "next-intl/server";
import { formatEur, priceLocale } from "@/lib/utils";

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

  // Don't render if Sofia has zeroed the threshold (e.g. always-free
  // shipping campaign) — the bar would say "Free delivery from €0"
  // which reads as broken. Better to vanish.
  if (!thresholdEur || thresholdEur <= 0) return null;

  const amount = formatEur(thresholdEur, priceLocale(locale));

  return (
    <aside
      role="status"
      aria-label="Site announcement"
      // Vermilion bg with rice text so the bar reads as a quiet brand
      // accent rather than a banner ad. Single line, centered, capped
      // tracking. The `relative z-50` keeps it above the page wash but
      // below modals (the cart drawer is z-[80], cookie banner z-[60]).
      className="relative z-50 w-full bg-vermilion text-rice"
    >
      <div className="container flex items-center justify-center py-2 text-center">
        <span className="text-[10px] uppercase tracking-label sm:text-[11px]">
          {t("free_shipping", { amount })}
        </span>
      </div>
    </aside>
  );
}
