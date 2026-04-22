// ─────────────────────────────────────────────────────────────────────────
// SortSelect — tiny dropdown that rewrites the URL on change.
//
// Client component because a native <select> needs an onChange handler
// and router.push().  We intentionally use a native <select> rather than
// a custom popover for a11y + mobile parity.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import type { ShopSort } from "@/lib/queries/products";

const OPTIONS: ShopSort[] = ["newest", "price_asc", "price_desc"];

export function SortSelect({ current }: { current: ShopSort }) {
  const t = useTranslations("shop");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as ShopSort;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "newest") params.delete("sort");
    else params.set("sort", next);
    const qs = params.toString();
    // { scroll: false } — sort is a refinement of the current view, not a
    // navigation.  Keep the user's scroll position so they stay where they
    // were reading.  Same rule applies to the category pills below.
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <label className="flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid">
      <span className="sr-only md:not-sr-only">{t("sort_label")}</span>
      <select
        value={current}
        onChange={onChange}
        className="bg-transparent text-ink focus:outline-none focus:underline focus:decoration-vermilion focus:underline-offset-8"
        aria-label={t("sort_label")}
      >
        {OPTIONS.map((o) => (
          <option key={o} value={o}>
            {t(`sort_${o}` as "sort_newest" | "sort_price_asc" | "sort_price_desc")}
          </option>
        ))}
      </select>
    </label>
  );
}
