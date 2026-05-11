// ─────────────────────────────────────────────────────────────────────────
// RetryPaymentButton — G4: surfaces a "Retry payment" CTA on the
// customer's own order detail page and on the checkout failure page
// when an order is stuck in PENDING + FAILED/EXPIRED/CANCELED.
//
// Click hits retryOrderPaymentAction which creates a fresh Mollie
// payment and redirects the customer to the new hosted checkout URL.
// If creation fails (Mollie outage, etc) we surface an inline error
// instead of a destination redirect.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useTransition } from "react";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { retryOrderPaymentAction } from "@/lib/checkout/retry-payment";

type Props = {
  orderId: string;
  locale: string;
  /** Optional label override — defaults to "Retry payment". */
  label?: string;
  /** Visual variant — "primary" (filled ink) for the failure page,
   *  "outline" (border only) for the account order page where it sits
   *  next to other quieter actions. */
  variant?: "primary" | "outline";
};

export function RetryPaymentButton({
  orderId,
  locale,
  label = "Retry payment",
  variant = "primary",
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await retryOrderPaymentAction(formData);
      // The action redirects on success — if we reach here, something
      // returned a structured failure. Map to a friendly message.
      if (!res.ok) {
        const map: Record<typeof res.reason, string> = {
          "not-found": "We couldn't find this order.",
          "not-retryable":
            "This order isn't waiting on payment any more. Refresh the page to see its current status.",
          "provider-error":
            "Our payment provider is having a moment. Please try again in a few minutes.",
          auth: "Please sign in again to continue.",
        };
        setError(map[res.reason]);
      }
    });
  }

  return (
    <form action={handleSubmit} className="inline-flex flex-col items-start gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        disabled={isPending}
        className={
          variant === "primary"
            ? "inline-flex h-12 items-center gap-2 bg-ink px-6 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion disabled:cursor-not-allowed disabled:opacity-60"
            : "inline-flex h-10 items-center gap-2 border border-ink px-4 text-[11px] uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-rice disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowRight className="h-3.5 w-3.5" />
        )}
        {label}
      </button>
      {error && (
        <p
          className="inline-flex items-start gap-1.5 text-[12px] text-vermilion"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden />
          {error}
        </p>
      )}
    </form>
  );
}
