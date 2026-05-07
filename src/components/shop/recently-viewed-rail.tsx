// ─────────────────────────────────────────────────────────────────────────
// RecentlyViewedRail — horizontal rail at the bottom of shop / category /
// search / PDP. Reads from localStorage (no server roundtrip, no consent
// banner). Renders only when there's at least 2 items to show after
// excluding the current product.
//
// Why client-only: the data is per-device and not worth syncing to the
// server. We accept the tradeoff that switching browsers loses history.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn, formatEur, priceLocale } from "@/lib/utils";
import {
  readRecentlyViewed,
  type RecentlyViewedItem,
} from "@/lib/recently-viewed";

type Props = {
  /** Optional: hide this slug from the rail (typical: the current PDP). */
  excludeSlug?: string;
  /** How many items to show. Default 6 — fits most viewports cleanly. */
  limit?: number;
};

export function RecentlyViewedRail({ excludeSlug, limit = 6 }: Props) {
  const t = useTranslations("shop");
  const locale = useLocale();
  const ccy = priceLocale(locale);
  const [items, setItems] = useState<RecentlyViewedItem[] | null>(null);

  // Hydrate after mount — localStorage isn't available during SSR and
  // we don't want a flash of empty rail then sudden content. Showing
  // null first → the rail simply doesn't render until we know.
  useEffect(() => {
    setItems(readRecentlyViewed());
  }, []);

  if (items === null) return null;

  const visible = items
    .filter((it) => it.slug !== excludeSlug)
    .slice(0, limit);

  // Hide the rail entirely when there's nothing meaningful to show.
  // 1 item = "you're looking at it" — not interesting enough.
  if (visible.length < 2) return null;

  return (
    <section
      aria-labelledby="recently-viewed-heading"
      className="container mt-20 border-t border-ink/10 pt-10 md:mt-28 md:pt-14"
    >
      <header className="flex items-baseline justify-between">
        <h2
          id="recently-viewed-heading"
          className="font-display text-[20px] leading-tight text-ink md:text-[24px]"
        >
          {t("recently_viewed_title")}
        </h2>
      </header>

      <ul className="-mx-4 mt-6 flex gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {visible.map((item) => (
          <li key={item.slug} className="w-[180px] flex-shrink-0 md:w-[200px]">
            <Link
              href={`/shop/${item.slug}`}
              className="group block"
            >
              <div className="aspect-[4/5] overflow-hidden bg-rice-dim">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-label text-ink-mid">
                    Asian Beauty Shop
                  </div>
                )}
              </div>
              <p className="mt-3 line-clamp-2 text-[13px] text-ink transition-colors group-hover:text-vermilion">
                {item.name}
              </p>
              <p className="mt-1 flex items-baseline gap-2 text-[12px]">
                {item.comparePriceEur && item.comparePriceEur > item.priceEur && (
                  <span className="text-ink-mid line-through">
                    {formatEur(item.comparePriceEur, ccy)}
                  </span>
                )}
                <span
                  className={cn(
                    "font-display text-[14px] text-ink",
                  )}
                >
                  {formatEur(item.priceEur, ccy)}
                </span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
