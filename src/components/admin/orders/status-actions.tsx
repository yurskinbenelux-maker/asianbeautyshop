// ─────────────────────────────────────────────────────────────────────────
// Status-transition action buttons for the order detail page.
//
// Client component because each transition needs feedback (spinner,
// success/error toast line) — useActionState + useFormStatus give us
// that without any extra runtime.
//
// We compute the list of legal next states on the server (canTransition
// lives in actions.ts) and hand it down as a prop, so this component
// has no business logic: it just renders the buttons the parent told
// it to render.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import {
  updateOrderStatusAction,
  type ActionState,
} from "@/app/admin/orders/actions";

const INITIAL: ActionState = { ok: false };

export function StatusActions({
  orderId,
  options,
}: {
  orderId: string;
  options: { value: OrderStatus; label: string; variant: "primary" | "secondary" | "danger" }[];
}) {
  const [state, action] = useActionState(updateOrderStatusAction, INITIAL);

  if (options.length === 0) {
    return (
      <p className="text-[12px] text-ink-mid">
        No further status changes available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="orderId" value={orderId} />
        {options.map((o) => (
          <TransitionButton
            key={o.value}
            value={o.value}
            variant={o.variant}
          >
            {o.label}
          </TransitionButton>
        ))}
      </form>
      {state.message && (
        <p
          className={
            "inline-flex items-center gap-1.5 text-[12px] " +
            (state.ok ? "text-sage" : "text-vermilion")
          }
          role="status"
          aria-live="polite"
        >
          {state.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {state.message}
        </p>
      )}
    </div>
  );
}

function TransitionButton({
  value,
  variant,
  children,
}: {
  value: OrderStatus;
  variant: "primary" | "secondary" | "danger";
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  const base =
    "inline-flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-label transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "border border-ink bg-ink text-white hover:bg-ink/90"
      : variant === "danger"
        ? "border border-vermilion/70 text-vermilion hover:bg-vermilion hover:text-white"
        : "border border-ink/20 text-ink hover:border-ink hover:bg-ink hover:text-white";

  return (
    <button
      type="submit"
      name="next"
      value={value}
      disabled={pending}
      className={`${base} ${styles}`}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
