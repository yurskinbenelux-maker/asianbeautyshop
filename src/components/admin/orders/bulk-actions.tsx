// ─────────────────────────────────────────────────────────────────────────
// Bulk-actions wrapper for the orders table.
//
// The list page wraps its <table> in this form so every row's checkbox
// (name="orderIds") becomes part of the same submission. A fixed footer
// appears when at least one row is checked; it shows the count and
// offers the bulk action buttons.
//
// Kept minimal on purpose — the only bulk action currently wired in is
// "mark as fulfilling". Adding more (export selected, mark shipped from
// a batch CSV, etc.) is a matter of adding buttons that call other
// actions from actions.ts.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  bulkMarkFulfillingAction,
  type ActionState,
} from "@/app/admin/orders/actions";

const INITIAL: ActionState = { ok: false };

export function BulkFulfillingForm({ children }: { children: React.ReactNode }) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [state, action] = useActionState(bulkMarkFulfillingAction, INITIAL);

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

  // Clear checkboxes after a successful bulk action so Sofia doesn't
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

  return (
    <form ref={formRef} action={action}>
      {children}

      {/* Bulk-action footer — floats in when something's selected */}
      {(selectedCount > 0 || state.message) && (
        <div
          className="sticky bottom-4 z-20 mt-4 flex items-center justify-between gap-4 border border-ink/15 bg-rice/95 px-4 py-3 shadow-lg backdrop-blur"
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
            <SubmitButton disabled={selectedCount === 0}>
              Mark as fulfilling
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
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
