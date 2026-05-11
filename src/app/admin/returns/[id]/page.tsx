// ─────────────────────────────────────────────────────────────────────────
// /admin/returns/[id] — single return detail with a status-aware workflow.
//
// H3 restructure:
//
//   The canonical happy path is REQUESTED → APPROVED → RECEIVED (which
//   fires Mollie refund + Credit Note + loyalty clawback + VAT YTD
//   subtraction). Before H3 every available transition rendered as an
//   equal-weight button at the bottom; admin had to know which one was
//   the "right" next one. After H3, the primary next step is hoisted
//   into a "Next step" card at the top with the matching form fields
//   inline. Edge-case actions (Reject, Cancel) move under a "Other
//   actions" section. Tracking number/URL — almost-never-used since
//   self-postage went canonical (H8) — hides inside a collapsed
//   disclosure.
//
//   The H1 hard gate (refundAmount required before RECEIVED) stays in
//   place server-side; the UI now visibly pairs the input with the
//   button so admin can't miss it.
// ─────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, CheckCircle2, ArrowRight, AlertTriangle } from "lucide-react";

import { requireAdmin } from "@/lib/auth";
import { getReturnByIdForAdmin } from "@/lib/returns/db";
import { ALLOWED_TRANSITIONS } from "@/lib/returns/types";
import { cn } from "@/lib/utils";
import { formatAdminDateTime } from "@/lib/utils/format-date";

import {
  transitionReturnAction,
  updateReturnNotesAction,
} from "./actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

// Tints for each status badge — vermilion for end-state, ink for in-flight,
// muted for terminal-but-non-money (rejected/cancelled).
const STATUS_TINT: Record<string, string> = {
  REQUESTED: "border-gold/40 bg-gold/10 text-gold",
  APPROVED: "border-sage/40 bg-sage/10 text-sage",
  RECEIVED: "border-ink/30 bg-ink/5 text-ink",
  REFUNDED: "border-vermilion/40 bg-vermilion/5 text-vermilion",
  REJECTED: "border-ink/20 bg-ink/5 text-ink-mid",
  CANCELLED: "border-ink/20 bg-ink/5 text-ink-mid",
};

export default async function AdminReturnDetail({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const { error: errorCode } = await searchParams;
  const ret = await getReturnByIdForAdmin(id);
  if (!ret) notFound();

  const allowedNext = ALLOWED_TRANSITIONS[ret.status];
  const customer =
    [ret.customerFirstName, ret.customerLastName]
      .filter(Boolean)
      .join(" ")
      .trim() || ret.orderEmail;

  // ── Primary / secondary transition split ───────────────────────────
  // The canonical happy path: REQUESTED → APPROVED → RECEIVED → REFUNDED.
  // From each status, the "primary" transition is the next forward step;
  // everything else is an edge-case (reject, cancel).
  const PRIMARY_BY_STATUS: Record<string, string | null> = {
    REQUESTED: "APPROVED",
    APPROVED: "RECEIVED",
    RECEIVED: "REFUNDED",
    REFUNDED: null,
    REJECTED: null,
    CANCELLED: null,
  };
  const primaryTarget = PRIMARY_BY_STATUS[ret.status];
  const primaryAllowed = primaryTarget && allowedNext.includes(primaryTarget as never);
  const secondaryTargets = allowedNext.filter((t) => t !== primaryTarget);

  // Human label + helper text per primary transition.
  function primaryCopy(target: string | null): { label: string; helper: string } {
    switch (target) {
      case "APPROVED":
        return {
          label: "Approve return",
          helper:
            "Sends the customer the return address email (self-postage). They'll ship at their cost and reply with a tracking number.",
        };
      case "RECEIVED":
        return {
          label: "Mark received & refund",
          helper:
            "Fires the full refund pipeline: Mollie refund → credit note (CN-2026-NNNNN) → loyalty clawback → VAT YTD subtraction → customer email. Refund amount below must be saved first.",
        };
      case "REFUNDED":
        return {
          label: "Mark refunded",
          helper:
            "Manual mark of the terminal REFUNDED state. Use only if the automated pipeline didn't transition correctly.",
        };
      default:
        return { label: "", helper: "" };
    }
  }
  const primary = primaryCopy(primaryTarget);

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <Link
        href="/admin/returns"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to returns
      </Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Return request</div>
          <h1 className="mt-2 font-display text-[32px] leading-tight text-ink">
            {ret.publicNumber}
          </h1>
          <p className="mt-2 text-[13px] text-ink-mid">
            <Link
              href={`/admin/orders/${ret.orderId}`}
              className="underline decoration-ink/20 underline-offset-4 hover:decoration-vermilion"
            >
              Order {ret.orderPublicNumber}
            </Link>{" "}
            · {customer} · {ret.orderEmail}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center border px-2.5 py-1 text-[11px] uppercase tracking-label",
            STATUS_TINT[ret.status] ?? "border-ink/20 bg-ink/5 text-ink",
          )}
        >
          {ret.status.toLowerCase()}
        </span>
      </header>

      {/* H1 hard-gate error banner. Stays in place — it's a final
       *  catch in case admin still manages to click Mark Received
       *  before saving an amount (e.g. via a stale form). */}
      {errorCode === "refund_amount_required" ? (
        <div className="mt-6 flex items-start gap-3 border border-vermilion/40 bg-vermilion/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-vermilion" aria-hidden />
          <div className="text-[13px] leading-relaxed text-ink">
            <strong className="text-vermilion">Refund amount required.</strong>{" "}
            Enter the amount in the field below and click <strong>Save refund amount</strong>{" "}
            first, then click <strong>Mark received &amp; refund</strong>. The
            refund pipeline only fires once the amount is on file.
          </div>
        </div>
      ) : null}

      {/* ── Next step card ────────────────────────────────────────────
       *  The whole point of H3: make the canonical happy-path action
       *  unmistakable. Renders nothing for terminal statuses (REFUNDED
       *  / REJECTED / CANCELLED) — the work is done. */}
      {primaryAllowed ? (
        <section className="mt-6 border-2 border-vermilion/30 bg-vermilion/[0.03] p-6">
          <div className="eyebrow text-vermilion">Next step</div>
          <h2 className="mt-2 font-display text-[22px] leading-tight text-ink">
            {primary.label}
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-mid">
            {primary.helper}
          </p>

          {/* APPROVED → RECEIVED requires a refund amount on file.
           *  Pair the input visually with the action button so admin
           *  can't miss it. The amount is saved via the existing
           *  updateReturnNotesAction; once saved, click Mark received. */}
          {primaryTarget === "RECEIVED" ? (
            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <form action={updateReturnNotesAction} className="space-y-2">
                <input type="hidden" name="returnId" value={ret.id} />
                {/* Hidden passthrough so we don't blank these on Save */}
                <input
                  type="hidden"
                  name="adminNotes"
                  value={ret.adminNotes ?? ""}
                />
                <input
                  type="hidden"
                  name="trackingNumber"
                  value={ret.trackingNumber ?? ""}
                />
                <input
                  type="hidden"
                  name="trackingUrl"
                  value={ret.trackingUrl ?? ""}
                />
                <label className="block">
                  <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                    Step 1 · Refund amount (€)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="refundAmount"
                    defaultValue={ret.refundAmount ?? ""}
                    placeholder="e.g. 44.99"
                    className="w-full max-w-xs border border-ink/20 bg-white px-3 py-2 text-[14px] text-ink focus:border-vermilion focus:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  className="border border-ink/20 bg-white px-4 py-2 text-[11px] uppercase tracking-label text-ink transition-colors hover:border-ink"
                >
                  Save refund amount
                </button>
              </form>

              <form action={transitionReturnAction}>
                <input type="hidden" name="returnId" value={ret.id} />
                <input type="hidden" name="target" value={primaryTarget} />
                <div className="text-right">
                  <span className="block text-[11px] uppercase tracking-label text-ink-mid">
                    Step 2
                  </span>
                  <button
                    type="submit"
                    disabled={!ret.refundAmount || Number(ret.refundAmount) <= 0}
                    className="mt-1 inline-flex items-center gap-2 border border-vermilion bg-vermilion px-5 py-3 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                    title={
                      !ret.refundAmount || Number(ret.refundAmount) <= 0
                        ? "Save a refund amount first (Step 1)"
                        : `Fires Mollie refund of €${Number(ret.refundAmount).toFixed(2)}`
                    }
                  >
                    {primary.label}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* REQUESTED → APPROVED, or any other forward transition that
             * doesn't need a paired input. Single big button. */
            <form action={transitionReturnAction} className="mt-5">
              <input type="hidden" name="returnId" value={ret.id} />
              <input type="hidden" name="target" value={primaryTarget!} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 border border-vermilion bg-vermilion px-5 py-3 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink hover:border-ink"
              >
                {primary.label}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </form>
          )}
        </section>
      ) : (
        /* Terminal state — show a quiet "done" line instead of an empty
         * card, so admin knows nothing's expected of them. */
        <section className="mt-6 flex items-center gap-2 border border-ink/10 bg-ink/[0.02] px-4 py-3 text-[13px] text-ink-mid">
          <CheckCircle2 className="h-4 w-4 text-sage" aria-hidden />
          This return has reached a terminal state — no further action needed.
        </section>
      )}

      <div className="rule my-8" />

      {/* ── Items + Reason side by side ──────────────────────────────── */}
      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <div className="eyebrow mb-4">Items</div>
          <ul className="divide-y divide-ink/10 border-y border-ink/10">
            {ret.items.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-6 py-4"
              >
                <div>
                  <div className="text-[14px] text-ink">{it.nameSnapshot}</div>
                  <div className="text-[11px] text-ink-mid">{it.skuSnapshot}</div>
                </div>
                <div className="text-right text-[13px] text-ink">
                  × {it.quantity}
                  <div className="text-[11px] text-ink-mid">
                    €{it.unitPrice.toFixed(2)} → €{it.lineTotal.toFixed(2)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <div className="eyebrow mb-2">Customer's reason</div>
          <p className="text-[14px] text-ink">
            {ret.reason.replace(/_/g, " ").toLowerCase()}
          </p>
          {ret.details ? (
            <blockquote className="mt-3 whitespace-pre-line border-l-2 border-ink/10 pl-4 text-[13px] leading-relaxed text-ink-mid">
              {ret.details}
            </blockquote>
          ) : (
            <p className="mt-2 text-[12px] italic text-ink-mid/70">
              No details supplied
            </p>
          )}
        </section>
      </div>

      <div className="rule my-8" />

      {/* ── Admin notes (always visible) ─────────────────────────────── */}
      <section>
        <div className="eyebrow mb-3">Admin notes (private)</div>
        <form action={updateReturnNotesAction} className="space-y-3">
          <input type="hidden" name="returnId" value={ret.id} />
          {/* Hidden passthroughs so saving notes doesn't blank the rest */}
          <input
            type="hidden"
            name="refundAmount"
            value={ret.refundAmount ?? ""}
          />
          <input
            type="hidden"
            name="trackingNumber"
            value={ret.trackingNumber ?? ""}
          />
          <input
            type="hidden"
            name="trackingUrl"
            value={ret.trackingUrl ?? ""}
          />
          <textarea
            name="adminNotes"
            rows={3}
            defaultValue={ret.adminNotes ?? ""}
            placeholder="Internal notes — never sent to the customer. Required when rejecting (surfaces in the rejection email)."
            className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            className="border border-ink/20 bg-white px-4 py-2 text-[11px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white"
          >
            Save notes
          </button>
        </form>
      </section>

      {/* ── Carrier tracking — collapsed disclosure ──────────────────────
       *  Self-postage means the customer picks the carrier and sends us
       *  the tracking number via email reply. Most admins won't fill
       *  this in. Kept here for the cases where admin wants the audit
       *  trail. <details> stays closed by default. */}
      <details className="mt-8 border-t border-ink/10 pt-6">
        <summary className="cursor-pointer text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink">
          Carrier tracking (optional, self-postage)
        </summary>
        <form action={updateReturnNotesAction} className="mt-4 space-y-3">
          <input type="hidden" name="returnId" value={ret.id} />
          <input
            type="hidden"
            name="adminNotes"
            value={ret.adminNotes ?? ""}
          />
          <input
            type="hidden"
            name="refundAmount"
            value={ret.refundAmount ?? ""}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                Tracking number
              </span>
              <input
                type="text"
                name="trackingNumber"
                defaultValue={ret.trackingNumber ?? ""}
                placeholder="(customer-supplied)"
                className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                Tracking URL
              </span>
              <input
                type="url"
                name="trackingUrl"
                defaultValue={ret.trackingUrl ?? ""}
                placeholder="https://..."
                className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
              />
            </label>
          </div>
          <button
            type="submit"
            className="border border-ink/20 bg-white px-4 py-2 text-[11px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white"
          >
            Save tracking
          </button>
        </form>
      </details>

      {/* ── Other actions (reject / cancel / etc.) ─────────────────────
       *  Only renders when there are non-primary transitions available
       *  AND the return isn't terminal. Visually de-emphasized to
       *  prevent accidental clicks. Each fires its own email (rejected
       *  email surfaces admin notes, cancelled is generic). */}
      {secondaryTargets.length > 0 ? (
        <section className="mt-10 border-t border-ink/10 pt-6">
          <div className="eyebrow mb-3 text-ink-mid">Other actions</div>
          <div className="flex flex-wrap items-center gap-3">
            {secondaryTargets.map((target) => (
              <form key={target} action={transitionReturnAction}>
                <input type="hidden" name="returnId" value={ret.id} />
                <input type="hidden" name="target" value={target} />
                <button
                  type="submit"
                  className="border border-ink/20 bg-white px-4 py-2 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink/40 hover:text-ink"
                >
                  → {target.toLowerCase()}
                </button>
              </form>
            ))}
          </div>
          {allowedNext.includes("REJECTED" as never) ? (
            <p className="mt-3 text-[11px] leading-relaxed text-ink-mid">
              Belgian law (Code de droit économique VI.83) requires us to
              explain WHY a return is refused. Save admin notes above
              first — they're included verbatim in the rejection email.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Audit footer ─────────────────────────────────────────────── */}
      <p className="mt-10 text-[11px] text-ink-mid">
        Customer email: {ret.orderEmail} · Created{" "}
        {formatAdminDateTime(ret.createdAt)} · Updated{" "}
        {formatAdminDateTime(ret.updatedAt)}
      </p>
    </div>
  );
}
