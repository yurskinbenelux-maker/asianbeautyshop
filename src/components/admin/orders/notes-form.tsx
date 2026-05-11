// ─────────────────────────────────────────────────────────────────────────
// Admin notes editor — freeform internal notes, never shown to the customer.
//
// G8 (May 2026): added a "last updated <time> by <author>" caption under
// the textarea. Data comes from the `admin.note.updated` OrderEvent (which
// updateAdminNotesAction already creates on every save). Lets editors see
// when a note was last touched without diving into the audit log.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import {
  updateAdminNotesAction,
  type ActionState,
} from "@/app/admin/orders/actions";

const INITIAL: ActionState = { ok: false };

export function NotesForm({
  orderId,
  defaultValue,
  lastUpdatedAt,
  lastUpdatedBy,
}: {
  orderId: string;
  defaultValue?: string | null;
  /** ISO date string or Date for the most recent admin.note.updated
   *  event on this order. Null = never edited (or events pruned). */
  lastUpdatedAt?: Date | string | null;
  /** Email of the admin who last edited the note (from event metadata).
   *  Falls back to "an admin" if missing — older events pre-dating the
   *  audit metadata won't have this. */
  lastUpdatedBy?: string | null;
}) {
  const [state, action] = useActionState(updateAdminNotesAction, INITIAL);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <textarea
        name="notes"
        defaultValue={defaultValue ?? ""}
        rows={4}
        maxLength={4000}
        placeholder="Private notes visible to admins only."
        className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
      />

      <div className="flex items-center gap-3">
        <SubmitButton>Save note</SubmitButton>
        {state.message && (
          <span
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
          </span>
        )}
      </div>

      {/* G8: last-edited caption. Only renders if there's a recorded
       *  event — fresh orders with no note never show this. We don't
       *  gate on `defaultValue` because a cleared note still has an
       *  event ("X cleared the note on Mon") which is useful audit. */}
      {lastUpdatedAt ? (
        <LastUpdatedCaption at={lastUpdatedAt} by={lastUpdatedBy ?? null} />
      ) : null}
    </form>
  );
}

function LastUpdatedCaption({
  at,
  by,
}: {
  at: Date | string;
  by: string | null;
}) {
  const date = typeof at === "string" ? new Date(at) : at;
  // Locale-aware short form: "11 May 2026, 14:32". Avoids 24h vs 12h
  // surprises on Sofia's laptop vs Max's MacBook — formatter picks the
  // user's actual locale at runtime.
  const absolute = date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const relative = formatRelative(date);

  return (
    <p
      className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-ink-mid"
      title={absolute}
    >
      <Clock className="h-3 w-3" aria-hidden />
      <span>
        Last updated{" "}
        <time dateTime={date.toISOString()} className="text-ink/80">
          {relative}
        </time>
      </span>
      {by ? (
        <>
          <span aria-hidden>·</span>
          <span className="text-ink/80">{by}</span>
        </>
      ) : null}
    </p>
  );
}

/** Lightweight relative time formatter — keeps the caption short
 *  ("2 min ago" / "yesterday") instead of a full datetime in the body.
 *  Full datetime is on the title= tooltip for hover precision. */
function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk} wk ago`;
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}
