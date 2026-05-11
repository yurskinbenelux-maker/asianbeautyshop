// ─────────────────────────────────────────────────────────────────────────
// Bulk-actions wrapper for the orders table.
//
// The list page wraps its <table> in this form so every row's checkbox
// (name="orderIds") becomes part of the same submission. A fixed footer
// appears when at least one row is checked; it shows the count and
// offers the bulk action buttons.
//
// Two actions wired in:
//   · Mark as fulfilling — picks up the PAID queue when an admin starts
//     pulling stock
//   · Mark as shipped    — wraps up a fulfilment batch with one click;
//     fires the shipped email per order, skips digital-only carts and
//     orders that can't legally transition
//
// We don't ship a real <form>-level dispatch because each button needs
// its own server action. Instead, both buttons use formAction= to point
// at their own bound action on submit. React 19's useActionState wires
// the result of whichever button fired into the same `state` slot, so
// the footer message renders for both.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { CheckCircle2, Loader2, Package, Truck } from "lucide-react";
import {
  bulkMarkFulfillingAction,
  bulkMarkShippedAction,
  type ActionState,
} from "@/app/admin/orders/actions";

const INITIAL: ActionState = { ok: false };

export function BulkFulfillingForm({ children }: { children: React.ReactNode }) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  // Two separate action states — the form has two submit buttons, each
  // bound to a different server action via formAction=. React's
  // useActionState pattern requires one state slot per action, so we
  // declare both here. The footer renders whichever has a fresh
  // message.
  const [fulfillingState, fulfillingAction] = useActionState(
    bulkMarkFulfillingAction,
    INITIAL,
  );
  const [shippedState, shippedAction] = useActionState(
    bulkMarkShippedAction,
    INITIAL,
  );
  // Pick whichever has the more recent message — both states start as
  // INITIAL, so any message means that action just ran.
  const state =
    shippedState.message && !fulfillingState.message
      ? shippedState
      : !shippedState.message && fulfillingState.message
        ? fulfillingState
        : shippedState.message
          ? shippedState
          : fulfillingState;

  // Recount whenever a checkbox toggles inside the form.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const update = () => {
      const boxes = form.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][name="orderIds"]:checked',
      );
      setSelectedCount(boxes.length);
    };

    update(); // in case server re-rendered with some pre-checked (rare)
    form.addEventListener("change", update);
    return () => form.removeEventListener("change", update);
  }, []);

  // Clear checkboxes after a successful bulk action so an admin doesn't
  // accidentally re-apply the same operation.
  useEffect(() => {
    if (state.ok) {
      const form = formRef.current;
      if (!form) return;
      form
        .querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"][name="orderIds"]:checked',
        )
        .forEach((el) => {
          el.checked = false;
        });
      setSelectedCount(0);
    }
  }, [state]);

  // Form has no `action` prop — each submit button has its own formAction.
  // This lets the table sit inside one form (so all checkboxes share a
  // namespace) but lets the admin pick which bulk operation to fire.
  return (
    <form ref={formRef}>
      {children}

      {/* Bulk-action footer — floats in when something's selected */}
      {(selectedCount > 0 || state.message) && (
        <div
          className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 border border-ink/15 bg-rice/95 px-4 py-3 shadow-lg backdrop-blur"
          role="region"
          aria-label="Bulk actions"
        >
          <div className="text-[12px]">
            {selectedCount > 0 ? (
              <span className="uppercase tracking-label text-ink">
                {selectedCount} selected
              </span>
            ) : state.ok ? (
              <span className="inline-flex items-center gap-1.5 text-sage">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {state.message}
              </span>
            ) : (
              <span className="text-vermilion">{state.message}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SubmitButton
              formAction={fulfillingAction}
              variant="secondary"
              disabled={selectedCount === 0}
              icon={<Package className="h-3.5 w-3.5" />}
            >
              Mark as fulfilling
            </SubmitButton>
            <SubmitButton
              formAction={shippedAction}
              variant="primary"
              disabled={selectedCount === 0}
              icon={<Truck className="h-3.5 w-3.5" />}
            >
              Mark as shipped
            </SubmitButton>
          </div>
        </div>
      )}
    </form>
  );
}

function SubmitButton({
  children,
  disabled,
  formAction,
  variant = "primary",
  icon,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  // Bind a specific action to this button — only this action fires when
  // this button is clicked, regardless of the parent <form action>.
  formAction: (formData: FormData) => void;
  variant?: "primary" | "secondary";
  icon?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending || disabled}
      className={
        variant === "primary"
          ? "inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
          : "inline-flex items-center gap-2 border border-ink/30 bg-white px-4 py-2 text-[11px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
      }
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : icon ? (
        icon
      ) : null}
      {children}
    </button>
  );
}
