// ─────────────────────────────────────────────────────────────────────────
// WishlistToggle — heart icon button for product cards + PDPs.
//
// Two visual variants:
//   • "card" — small, absolute-positioned over a product thumb
//   • "button" — pill-shaped, used on the PDP next to "Add to cart"
//
// Behaviour:
//   - Click → call toggleWishlistAction with { productId, locale }
//   - Optimistic update: flip filled/outlined immediately
//   - If the API says "needs sign-in", redirect to the locale sign-in
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Heart } from "lucide-react";
import { toggleWishlistAction } from "@/lib/wishlist/actions";
import { cn } from "@/lib/utils";

type Props = {
  productId: string;
  locale: string;
  initialWishlisted: boolean;
  variant?: "card" | "button";
  className?: string;
};

export function WishlistToggle({
  productId,
  locale,
  initialWishlisted,
  variant = "card",
  className,
}: Props) {
  const t = useTranslations("account");
  const router = useRouter();
  const pathname = usePathname();
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    const optimistic = !wishlisted;
    setWishlisted(optimistic);

    startTransition(async () => {
      const result = await toggleWishlistAction({
        productId,
        locale,
        returnTo: `/${locale}${pathname}`,
      });

      if (!result.ok) {
        // Revert optimistic flip.
        setWishlisted(!optimistic);
        if ("needsSignIn" in result && result.needsSignIn) {
          router.push(result.nextUrl);
        }
        return;
      }
      // Reconcile just in case (race).
      setWishlisted(result.wishlisted);
    });
  };

  const label = wishlisted
    ? t("wishlist_toggle.remove")
    : t("wishlist_toggle.add");

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-pressed={wishlisted}
        aria-label={label}
        className={cn(
          "inline-flex h-12 items-center gap-2 border border-ink/20 bg-white/60 px-5 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink",
          wishlisted && "border-ink text-vermilion",
          isPending && "cursor-wait opacity-60",
          className,
        )}
      >
        <Heart
          className={cn(
            "h-4 w-4 transition-colors",
            wishlisted && "fill-vermilion text-vermilion",
          )}
        />
        {wishlisted ? t("wishlist_toggle.saved") : t("wishlist_toggle.save")}
      </button>
    );
  }

  // "card" variant — floating circle in the thumbnail corner.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-pressed={wishlisted}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-rice/90 backdrop-blur transition-all hover:border-ink",
        wishlisted && "border-ink",
        isPending && "cursor-wait opacity-60",
        className,
      )}
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-colors",
          wishlisted ? "fill-vermilion text-vermilion" : "text-ink",
        )}
      />
    </button>
  );
}
