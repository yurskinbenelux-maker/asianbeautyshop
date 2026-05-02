// ─────────────────────────────────────────────────────────────────────────
// ReorderButton — one-click "put everything from this past order back
// in my cart" CTA on /account/orders/[number].
//
// Wraps the reorderAction in useActionState. On success we:
//   1. Open the cart drawer so the customer sees the items immediately.
//   2. Show a small status line with how many were added + which (if
//      any) couldn't be (archived / sold-out).
//
// Hidden when the order is empty or the customer is no longer logged
// in — both are guarded server-side too.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Loader2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/cart/cart-provider";
import {
  reorderAction,
  type ReorderResult,
} from "@/app/[locale]/account/orders/[number]/reorder-action";

export function ReorderButton({
  orderNumber,
  urlLocale,
}: {
  orderNumber: string;
  urlLocale: string;
}) {
  const t = useTranslations("account.reorder");
  const { openDrawer } = useCart();
  const [state, action] = useActionState<ReorderResult | null, FormData>(
    reorderAction,
    null,
  );

  // Open the cart drawer the moment we know items landed.
  useEffect(() => {
    if (state && state.ok && state.added > 0) {
      openDrawer();
    }
  }, [state, openDrawer]);

  return (
    <div className="space-y-2">
      <form action={action} className="inline-flex">
        <input type="hidden" name="locale" value={urlLocale} />
        <input type="hidden" name="orderNumber" value={orderNumber} />
        <Submit label={t("cta")} loadingLabel={t("loading")} />
      </form>

      {state && state.ok && (
        <p
          role="status"
          aria-live="polite"
          className="text-[12px] text-ink-mid"
        >
          {state.added > 0
            ? t("added", { count: state.added })
            : t("none_added")}
          {state.skipped.length > 0 && (
            <span className="ml-2 text-vermilion/80">
              {t("skipped", { count: state.skipped.length })}
            </span>
          )}
        </p>
      )}
      {state && !state.ok && (
        <p
          role="alert"
          className="text-[12px] uppercase tracking-label text-vermilion"
        >
          {t(`error.${state.reason}`)}
        </p>
      )}
    </div>
  );
}

function Submit({
  label,
  loadingLabel,
}: {
  label: string;
  loadingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-2 border border-ink/20 bg-white/70 px-4 py-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink",
        pending && "cursor-not-allowed opacity-60",
      )}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCw className="h-3.5 w-3.5" />
      )}
      {pending ? loadingLabel : label}
    </button>
  );
}
