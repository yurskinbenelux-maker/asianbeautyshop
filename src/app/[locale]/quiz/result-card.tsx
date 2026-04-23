// ─────────────────────────────────────────────────────────────────────────
// /[locale]/quiz — ritual result component.
//
// Renders the 4-step ritual returned by /api/ai/quiz as a gallery of
// product cards. Each card has:
//   · step label (Cleanse / Essence / …) with Korean step index
//   · product image (deep-linked to PDP)
//   · quick Add to cart button (uses the shared CartProvider)
//   · link to the product page for more detail
//
// Steps that have no matching product in the catalogue are skipped
// entirely — same graceful-degrade rule as the orb.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { Check, Loader2, RotateCcw, ShoppingBag } from "lucide-react";

import { Link } from "@/i18n/routing";
import { useCart } from "@/components/cart/cart-provider";
import type { RitualPick } from "@/lib/ai/catalog";
import { formatEur, priceLocale } from "@/lib/utils";

// Display labels per step id.  We don't translate these slugs — we pull
// the localised label from the `concierge` namespace.
const STEP_KEYS: Record<RitualPick["step"], string> = {
  cleanse: "step_cleanse",
  essence: "step_essence",
  moisturise: "step_moisturise",
  protect: "step_protect",
};

export function RitualResult({
  ritual,
  locale,
  onRetake,
}: {
  ritual: RitualPick[];
  locale: string;
  onRetake: () => void;
}) {
  const t = useTranslations("quizPage");
  const tConcierge = useTranslations("concierge");
  const uiLocale = useLocale();

  // Only render steps that found a product.  The rule-based engine may
  // return nulls when the catalogue is thin in a category.
  const filled = ritual.filter((r) => r.product !== null);

  return (
    <div className="border border-ink/10 bg-white/70 px-6 py-10 md:px-12 md:py-14">
      {/* masthead */}
      <div className="text-center">
        <div className="eyebrow">{tConcierge("result_eyebrow")}</div>
        <h2 className="mt-3 font-display text-[28px] leading-tight text-ink md:text-[36px]">
          {t("result_title")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-ink-mid">
          {t("result_lede")}
        </p>
      </div>

      {/* steps grid */}
      {filled.length > 0 ? (
        <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {filled.map((pick, idx) => (
            <RitualCard
              key={pick.step}
              pick={pick}
              index={idx}
              locale={uiLocale}
              urlLocale={locale}
              stepLabel={tConcierge(STEP_KEYS[pick.step])}
              addCtaLabel={t("add_to_cart")}
              addingCtaLabel={t("adding")}
              addedCtaLabel={t("added")}
              viewCtaLabel={t("view_product")}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-10 text-center text-[13px] italic text-ink-mid">
          {tConcierge("result_empty")}
        </p>
      )}

      {/* footer controls */}
      <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-ink/10 pt-8 sm:flex-row">
        <button
          type="button"
          onClick={onRetake}
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid hover:text-vermilion"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {tConcierge("quiz_retake")}
        </button>
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 bg-ink px-5 py-3 text-[11px] uppercase tracking-label text-rice hover:bg-vermilion"
        >
          {tConcierge("result_cta")}
        </Link>
      </div>
    </div>
  );
}

// ────────── single card ──────────────────────────────────────────────────

function RitualCard({
  pick,
  index,
  locale,
  urlLocale,
  stepLabel,
  addCtaLabel,
  addingCtaLabel,
  addedCtaLabel,
  viewCtaLabel,
}: {
  pick: RitualPick;
  index: number;
  locale: string; // UI locale — used for price formatting
  urlLocale: string; // locale segment for PDP links (redundant but explicit)
  stepLabel: string;
  addCtaLabel: string;
  addingCtaLabel: string;
  addedCtaLabel: string;
  viewCtaLabel: string;
}) {
  const { addItem, isPending } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const [localPending, setLocalPending] = useState(false);

  const product = pick.product!;

  async function handleAdd() {
    if (localPending || justAdded) return;
    setLocalPending(true);
    try {
      await addItem({ productId: product.id, quantity: 1 });
      setJustAdded(true);
      // Revert the "Added" confirmation after a beat so the user can add
      // again if they want (the cart drawer opens anyway).
      setTimeout(() => setJustAdded(false), 2400);
    } finally {
      setLocalPending(false);
    }
  }

  const pending = localPending || (isPending && justAdded === false);

  // We don't use urlLocale for <Link> href because next-intl's Link
  // already prepends the active locale.  It's kept in the props as
  // documentation / future-proofing.
  void urlLocale;

  return (
    <li className="group flex flex-col border border-ink/10 bg-white/80">
      {/* image + step index */}
      <Link
        href={`/shop/${product.slug}`}
        className="relative block aspect-[4/5] overflow-hidden bg-ink/5"
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : null}
        {/* step chip */}
        <div className="absolute left-3 top-3 flex items-center gap-2 bg-white/85 px-2 py-1">
          <span className="font-kr text-[11px] leading-none text-vermilion">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-[9px] uppercase tracking-label text-ink-mid">
            {stepLabel}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link
          href={`/shop/${product.slug}`}
          className="font-display text-[16px] leading-snug text-ink hover:text-vermilion"
        >
          {product.name}
        </Link>
        {product.tagline ? (
          <div className="mt-1 text-[12px] text-ink-mid line-clamp-2">
            {product.tagline}
          </div>
        ) : null}
        <div className="mt-3 text-[14px] text-ink">
          {formatEur(product.priceEur, priceLocale(locale))}
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending}
            aria-busy={pending || undefined}
            className={`inline-flex items-center justify-center gap-2 px-3 py-2.5 text-[11px] uppercase tracking-label transition-colors ${
              justAdded
                ? "bg-celadon text-rice"
                : "bg-ink text-rice hover:bg-vermilion"
            } ${pending ? "cursor-wait opacity-80" : ""}`}
          >
            {justAdded ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden />
                {addedCtaLabel}
              </>
            ) : pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {addingCtaLabel}
              </>
            ) : (
              <>
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
                {addCtaLabel}
              </>
            )}
          </button>
          <Link
            href={`/shop/${product.slug}`}
            className="text-center text-[11px] uppercase tracking-label text-ink-mid underline decoration-vermilion/40 underline-offset-4 hover:text-vermilion"
          >
            {viewCtaLabel}
          </Link>
        </div>
      </div>
    </li>
  );
}
