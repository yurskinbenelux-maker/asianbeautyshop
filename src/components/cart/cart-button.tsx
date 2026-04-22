// ─────────────────────────────────────────────────────────────────────────
// CartButton — the icon in the top nav.
//
// Clicking it opens the drawer. A small badge on the top-right shows the
// total item count (sum of quantities across lines), hidden when zero.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "./cart-provider";
import { cn } from "@/lib/utils";

export function CartButton({ label }: { label: string }) {
  const { cart, openDrawer } = useCart();
  const count = cart.itemCount;

  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={
        count > 0 ? `${label} — ${count} items` : label
      }
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:text-vermilion"
    >
      <ShoppingBag className="h-4 w-4" />
      {count > 0 && (
        <span
          aria-hidden
          className={cn(
            "absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-vermilion px-1 font-body text-[10px] font-medium leading-none text-rice",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
