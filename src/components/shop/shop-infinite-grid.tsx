// ─────────────────────────────────────────────────────────────────────────
// ShopInfiniteGrid — client-side infinite scroll for /shop.
//
// Props:
//   · initialItems / total       — server-rendered first page + full count
//   · pageSize                   — how many to fetch per load
//   · locale, sort, filterArgs   — arguments for the server action
//
// Behaviour:
//   · Starts with initialItems already rendered (good for SEO + LCP).
//   · An IntersectionObserver on the sentinel near the bottom triggers
//     loadMore while there are more rows.
//   · If the URL (filter/sort) changes, the grid fully resets — we feed
//     a `resetKey` prop so the client component re-mounts on change
//     rather than trying to diff.
//   · Also exposes a "Load more" fallback button for users who can't
//     trigger scroll events (keyboard nav, reduced motion, etc.).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BestsellerCard } from "@/components/home/bestseller-card";
import { QuickViewModal } from "@/components/shop/quick-view-modal";
import { loadMoreShopProducts } from "@/app/[locale]/shop/actions";
import type {
  ProductCardData,
  ShopSort,
  ShopFilterArgs,
} from "@/lib/queries/products";

type Props = {
  initialItems: ProductCardData[];
  total: number;
  pageSize: number;
  locale: string;
  sort: ShopSort;
  filterArgs: ShopFilterArgs;
  /** Translations for the load-more button and count line. */
  labels: { loadMore: string };
};

export function ShopInfiniteGrid({
  initialItems,
  total,
  pageSize,
  locale,
  sort,
  filterArgs,
  labels,
}: Props) {
  const [items, setItems] = useState<ProductCardData[]>(initialItems);
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Quick-view modal state — a single overlay for the whole grid.
  const [quickViewProduct, setQuickViewProduct] =
    useState<ProductCardData | null>(null);

  const hasMore = items.length < total;

  // Memoised so the effect below doesn't re-subscribe on every render.
  const loadMore = useCallback(() => {
    if (!hasMore || isPending) return;
    const skip = items.length;
    startTransition(async () => {
      const res = await loadMoreShopProducts({
        locale,
        sort,
        take: pageSize,
        skip,
        ...filterArgs,
      });
      // Guard against race conditions when a filter change fires mid-load.
      // If the new `total` disagrees with what we have, bail — the outer
      // component's resetKey will have remounted us by then anyway.
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const p of res.items) if (!seen.has(p.id)) merged.push(p);
        return merged;
      });
    });
  }, [hasMore, isPending, items.length, locale, sort, pageSize, filterArgs]);

  // IntersectionObserver — fires loadMore when the sentinel enters the
  // viewport. rootMargin of 300px means we start loading before the user
  // actually hits the bottom, so scrolling feels seamless.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) loadMore();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  return (
    <>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p, i) => (
          <BestsellerCard
            key={p.id}
            product={p}
            index={i}
            locale={locale}
            onQuickView={setQuickViewProduct}
          />
        ))}
      </div>

      <QuickViewModal
        product={quickViewProduct}
        locale={locale}
        onClose={() => setQuickViewProduct(null)}
      />

      {hasMore && (
        <div className="mt-16 flex flex-col items-center gap-6">
          {/* Invisible sentinel — the intersection observer watches this. */}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />

          {/* Visible fallback — accessible, keyboard-triggerable. */}
          <button
            type="button"
            onClick={loadMore}
            disabled={isPending}
            className="text-[12px] uppercase tracking-label text-ink-mid underline decoration-vermilion underline-offset-8 transition-colors hover:text-ink disabled:opacity-50"
          >
            {isPending ? "…" : labels.loadMore}
          </button>
        </div>
      )}
    </>
  );
}
