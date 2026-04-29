// ─────────────────────────────────────────────────────────────────────────
// FreeShippingMeter — small progress indicator above the subtotal in
// the cart drawer (and on the cart page). Two states:
//   • subtotal < threshold → "€X to go for free shipping" + filling bar
//   • subtotal ≥ threshold → "You unlocked free shipping" pill, full bar
//
// Quiet by default — text-style typography, no neon green or sparkles.
// We want the customer to register the carrot and act, not feel sold to.
//
// Hidden when the threshold is 0 (Sofia disabled the perk in admin) or
// when the cart is empty (the surrounding components also gate that).
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn, formatEur, priceLocale } from "@/lib/utils";
import { useLocale } from "next-intl";

type Props = {
  subtotalEur: number;
  thresholdEur: number;
};

export function FreeShippingMeter({ subtotalEur, thresholdEur }: Props) {
  const t = useTranslations("cart");
  const locale = useLocale();
  const ccy = priceLocale(locale);

  if (thresholdEur <= 0) return null;

  const remainingEur = Math.max(0, thresholdEur - subtotalEur);
  const reached = remainingEur <= 0;
  // Cap at 100% — overshoot doesn't change the bar.
  const pct = Math.min(100, (subtotalEur / thresholdEur) * 100);

  return (
    <div aria-live="polite" className="space-y-1.5">
      <p
        className={cn(
          "flex items-center gap-1.5 text-[12px]",
          reached ? "text-ink" : "text-ink-mid",
        )}
      >
        {reached ? (
          <>
            <Check className="h-3.5 w-3.5 text-vermilion" aria-hidden />
            <span className="uppercase tracking-label">
              {t("free_shipping_unlocked")}
            </span>
          </>
        ) : (
          <span>
            {t("free_shipping_remaining", {
              amount: formatEur(remainingEur, ccy),
            })}
          </span>
        )}
      </p>
      {/* Track + fill — single div with a width transition. Keeping it
          background-only (no shadows) so it reads as a measurement, not
          a video-game progress bar. */}
      <div className="relative h-[3px] overflow-hidden bg-ink/10">
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width] duration-500",
            reached ? "bg-vermilion" : "bg-ink/60",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
