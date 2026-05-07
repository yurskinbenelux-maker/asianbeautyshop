"use client";

// ─────────────────────────────────────────────────────────────────────────
// ClaimDecisionForms — Approve / Reject UI for one claim.
//
// Approve is one click (with optional note). Reject opens a small
// inline form that requires a one-liner reason — an admin commits to the
// "why" because the customer sees it in their email.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Check, X } from "lucide-react";
import {
  approveClaimAction,
  rejectClaimAction,
} from "./actions";

export function ClaimDecisionForms({ claimId }: { claimId: string }) {
  const [rejectOpen, setRejectOpen] = useState(false);

  return (
    <div className="mt-5 flex flex-wrap items-start gap-3 border-t border-ink/10 pt-4">
      <form action={approveClaimAction}>
        <input type="hidden" name="claimId" value={claimId} />
        <button
          type="submit"
          className="inline-flex items-center gap-2 border border-sage bg-sage/10 px-4 py-2 text-[12px] uppercase tracking-label text-sage transition-colors hover:bg-sage hover:text-rice"
        >
          <Check className="h-3.5 w-3.5" />
          Approve + award
        </button>
      </form>

      {rejectOpen ? (
        <form action={rejectClaimAction} className="flex-1 min-w-[260px]">
          <input type="hidden" name="claimId" value={claimId} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <input
              type="text"
              name="adminNote"
              required
              maxLength={500}
              autoFocus
              placeholder="Reason — sent to the customer"
              className="flex-1 border border-ink/15 bg-white px-3 py-2 text-[13px] focus:border-vermilion focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 border border-vermilion bg-vermilion px-4 py-2 text-[12px] uppercase tracking-label text-rice transition-colors hover:bg-vermilion/90"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen(false)}
              className="text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setRejectOpen(true)}
          className="inline-flex items-center gap-2 border border-ink/20 bg-white/40 px-4 py-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
          Reject…
        </button>
      )}
    </div>
  );
}
