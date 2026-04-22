// ─────────────────────────────────────────────────────────────────────────
// AddToRitualButton — primary CTA on the PDP.
//
// Calls the cart context's addItem() which posts to the server action,
// patches the local cart, and opens the drawer on success. We also fire
// a small toast confirmation for users who dismiss the drawer quickly.
//
// The button has three states: idle · loading · success-flash. We don't
// disable the button during loading because a quick double-click should
// add two units (that's the customer's intent) — we just show a subtle
// loading cue on the label.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { cn } from "@/lib/utils";

export function AddToRitualButton({
  productId,
  sku,
}: {
  productId: string;
  sku: string;
}) {
  const t = useTranslations("product");
  const tCart = useTranslations("cart");
  const { addItem } = useCart();
  const [, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const onClick = () => {
    setIsAdding(true);
    startTransition(async () => {
      try {
        await addItem({ productId, quantity: 1 });
        setJustAdded(true);
        toast.success(tCart("added_toast"));
        // Reset the "just added" flash after 2s so the button returns
        // to its regular label for the next click.
        window.setTimeout(() => setJustAdded(false), 2000);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : tCart("add_failed"),
        );
      } finally {
        setIsAdding(false);
      }
    });
    // Log product context for ops debugging.
    console.debug("[cart:add]", { productId, sku });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-live="polite"
      className={cn(
        "group relative inline-flex h-14 w-full items-center justify-center overflow-hidden text-[13px] uppercase tracking-label text-rice transition-colors",
        justAdded
          ? "bg-ink/90"
          : isAdding
            ? "bg-ink/80"
            : "bg-ink hover:bg-vermilion",
      )}
    >
      <span className="relative z-10 inline-flex items-center gap-2">
        {justAdded ? (
          <>
            <Check className="h-3.5 w-3.5" aria-hidden />
            {tCart("added_inline")}
          </>
        ) : isAdding ? (
          <>
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-rice/70" />
            {tCart("adding")}
          </>
        ) : (
          t("add_to_ritual")
        )}
      </span>
    </button>
  );
}
