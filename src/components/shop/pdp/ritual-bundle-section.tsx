// ─────────────────────────────────────────────────────────────────────────
// RitualBundleSection — "Complete your skincare routine" block on the PDP.
//
// Renders a small horizontal strip of bundle suggestions curated by Sofia
// in ProductRelated (reason ∋ "bundle"/"skincare routine"). Each card is a link to
// the product's own PDP plus an "Add" quick-link that fires the cart
// context. If the list is empty the section renders nothing.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { toast } from "sonner";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Plus } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { formatEur } from "@/lib/utils";
import type { PdpBundleItem } from "@/lib/queries/pdp";

type Labels = {
  eyebrow: string;        // "Complete your skincare routine"
  title: string;          // "Pairs beautifully with"
  add: string;            // "Add"
};

export function RitualBundleSection({
  items,
  labels,
  currencyLocale,
}: {
  items: PdpBundleItem[];
  labels: Labels;
  currencyLocale: string;
}) {
  const tCart = useTranslations("cart");
  const { addItem } = useCart();
  const [, startTransition] = useTransition();

  if (items.length === 0) return null;

  const onAdd = (productId: string) => {
    startTransition(async () => {
      try {
        await addItem({ productId, quantity: 1 });
        toast.success(tCart("added_toast"));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : tCart("add_failed"),
        );
      }
    });
  };

  return (
    <section className="container mt-24">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="eyebrow">{labels.eyebrow}</div>
            <h2 className="mt-3 font-display text-[24px] leading-tight text-ink">
              {labels.title}
            </h2>
          </div>
        </div>

        <ul className="mt-8 grid grid-cols-1 gap-px overflow-hidden border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id} className="group flex flex-col bg-rice">
              <Link href={`/shop/${p.slug}`} className="block">
                <div className="relative aspect-[4/3] overflow-hidden bg-rice-dim">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.imageAlt ?? p.name}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-[18px] text-ink-mid">
                      YU.R
                    </div>
                  )}
                </div>
              </Link>

              <div className="flex flex-1 flex-col p-5">
                <Link href={`/shop/${p.slug}`} className="block">
                  <h3 className="font-display text-[17px] leading-tight text-ink">
                    {p.name}
                  </h3>
                  {p.tagline && (
                    <p className="mt-1 line-clamp-2 text-[12px] text-ink-mid">
                      {p.tagline}
                    </p>
                  )}
                </Link>

                <div className="mt-auto flex items-center justify-between pt-4">
                  <div className="font-display text-[15px] text-ink">
                    {formatEur(p.priceEur, currencyLocale)}
                  </div>
                  <button
                    type="button"
                    onClick={() => onAdd(p.id)}
                    className="inline-flex items-center gap-1.5 border border-ink px-3 py-1.5 text-[10px] uppercase tracking-label text-ink transition-colors hover:border-vermilion hover:bg-vermilion hover:text-rice"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    {labels.add}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
