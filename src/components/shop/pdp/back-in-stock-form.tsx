// ─────────────────────────────────────────────────────────────────────────
// BackInStockForm — the inline "notify me when it's back" capture.
//
// Renders only when the active variant is out of stock. Replaces the
// disabled "Add to cart" CTA with a simple email field + submit. On
// successful submit we collapse the form and show a quiet confirmation
// — same height as the input row so the layout doesn't jump.
//
// Server action is subscribeBackInStockAction (idempotent on
// (email, variantId) — re-submitting is a no-op success).
//
// Signed-in customers: no email in SSR/RSC/HTML. The browser checks
// the Supabase session client-side; the server action reads the email
// from the session cookie when the form omits it.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Locale } from "@prisma/client";
import { Bell, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  subscribeBackInStockAction,
  type SubscribeResult,
} from "@/app/[locale]/shop/[slug]/actions";

const INITIAL_STATE: SubscribeResult | null = null;

type Props = {
  /** The currently-selected (out-of-stock) variant. Required — when there's
   *  no variant, there's no stock concept and the form shouldn't render. */
  variantId: string;
  /** Customer's locale (uppercase Prisma enum value). Used to localise the
   *  back-in-stock email when it eventually fires. */
  locale: Locale;
};

export function BackInStockForm({ variantId, locale }: Props) {
  const t = useTranslations("product");
  const [state, formAction] = useActionState(
    subscribeBackInStockAction,
    INITIAL_STATE,
  );
  /** null = still checking session; true/false = guest vs signed-in */
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setIsSignedIn(!!user?.email);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // After a successful submit show the confirmation in place of the form.
  if (state?.ok) {
    return (
      <div
        className="flex h-14 w-full items-center justify-center gap-2 border border-ink/15 bg-rice-dim/40 px-5 text-[13px] text-ink-mid"
        aria-live="polite"
      >
        <Check className="h-3.5 w-3.5 text-gold" aria-hidden />
        <span>
          {state.alreadySubscribed
            ? t("back_in_stock_already_subscribed")
            : t("back_in_stock_thanks")}
        </span>
      </div>
    );
  }

  // Signed-in path: one-tap notify — email never rendered in HTML/RSC.
  // While session is loading, fall through to the guest layout (same
  // height) so the block doesn't jump when auth resolves.
  if (isSignedIn === true) {
    return (
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="variantId" value={variantId} />
        <input type="hidden" name="locale" value={locale} />
        <SubmitButton fullWidth />
        {state?.ok === false && (
          <p className="text-[12px] text-vermilion" role="alert">
            {state.message}
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-ink-mid">
          {t("back_in_stock_helper_signed_in")}
        </p>
      </form>
    );
  }

  // Guest path (or brief loading state): classic email + button row.
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-0">
        <input
          type="email"
          name="email"
          required
          aria-label={t("back_in_stock_email_label")}
          placeholder={t("back_in_stock_email_placeholder")}
          className={cn(
            "h-14 flex-1 border bg-white px-4 text-[14px] text-ink placeholder:text-ink-mid/60 focus:outline-none",
            state?.ok === false
              ? "border-vermilion focus:border-vermilion"
              : "border-ink/15 focus:border-ink sm:border-r-0",
          )}
        />
        <SubmitButton />
      </div>
      {state?.ok === false && (
        <p className="text-[12px] text-vermilion" role="alert">
          {state.message}
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-ink-mid">
        {t("back_in_stock_helper")}
      </p>
    </form>
  );
}

function SubmitButton({ fullWidth = false }: { fullWidth?: boolean } = {}) {
  const { pending } = useFormStatus();
  const t = useTranslations("product");
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-14 items-center justify-center gap-2 px-6 text-[12px] uppercase tracking-label transition-colors disabled:opacity-50",
        fullWidth ? "w-full" : "sm:min-w-[200px]",
        "bg-ink text-rice hover:bg-vermilion",
      )}
    >
      {pending ? null : <Bell className="h-3.5 w-3.5" aria-hidden />}
      {pending ? t("back_in_stock_submitting") : t("back_in_stock_cta")}
    </button>
  );
}
