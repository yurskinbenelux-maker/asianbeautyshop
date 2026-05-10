// ─────────────────────────────────────────────────────────────────────────
// /admin/returns/[id] — single return detail + status transition controls.
//
// Admin-only. Renders:
//   · Customer + order context (emails an admin's reply-to is the customer)
//   · Line items with unit price and line total
//   · Customer-provided reason + details
//   · Transition buttons — only the transitions allowed by canTransition()
//   · Admin notes, refund amount, tracking number/url — editable inline
//
// Each transition POSTs to a server action in ./actions.ts. The action
// validates the transition via ALLOWED_TRANSITIONS before writing, and
// fires the customer-facing email (approved/received/refunded).
// ─────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requireAdmin } from "@/lib/auth";
import { getReturnByIdForAdmin } from "@/lib/returns/db";
import { ALLOWED_TRANSITIONS } from "@/lib/returns/types";
import { cn } from "@/lib/utils";

import {
  transitionReturnAction,
  updateReturnNotesAction,
} from "./actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
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
            Order {ret.orderPublicNumber} · {customer} · {ret.orderEmail}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center border px-2.5 py-1 text-[11px] uppercase tracking-label",
            ret.status === "REFUNDED"
              ? "border-vermilion/40 bg-vermilion/5 text-vermilion"
              : "border-ink/20 bg-ink/5 text-ink",
          )}
        >
          {ret.status.toLowerCase()}
        </span>
      </header>

      {/* H1 hard-gate error banner. Set when the action redirected
       *  here with ?error=refund_amount_required (admin clicked Mark
       *  Received without saving the refund amount first). Vermilion-
       *  tinted to match the rest of the danger palette. Auto-clears
       *  the next time admin navigates away and back. */}
      {errorCode === "refund_amount_required" ? (
        <div className="mt-6 border border-vermilion/40 bg-vermilion/5 p-4 text-[13px] leading-relaxed text-ink">
          <strong className="text-vermilion">Refund amount required.</strong>{" "}
          Enter a refund amount in the &ldquo;Refund €&rdquo; field below and
          click <strong>Save</strong> on that form FIRST. Then click{" "}
          <strong>Mark received</strong> — that&apos;s when Mollie + credit
          note + loyalty clawback all fire.
        </div>
      ) : null}

      <div className="rule my-8" />

      {/* items */}
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

      <div className="grid gap-8 md:grid-cols-2 mt-8">
        {/* reason */}
        <section>
          <div className="eyebrow mb-2">Reason</div>
          <p className="text-[14px] text-ink">{ret.reason.replace(/_/g, " ").toLowerCase()}</p>
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

        {/* admin notes + refund + tracking form */}
        <section>
          <div className="eyebrow mb-2">Internal</div>
          <form action={updateReturnNotesAction} className="space-y-4">
            <input type="hidden" name="returnId" value={ret.id} />
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                Admin notes
              </span>
              <textarea
                name="adminNotes"
                rows={3}
                defaultValue={ret.adminNotes ?? ""}
                className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                  Refund €
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="refundAmount"
                  defaultValue={ret.refundAmount ?? ""}
                  className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                  Tracking number
                </span>
                <input
                  type="text"
                  name="trackingNumber"
                  defaultValue={ret.trackingNumber ?? ""}
                  className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                Tracking URL
              </span>
              <input
                type="url"
                name="trackingUrl"
                defaultValue={ret.trackingUrl ?? ""}
                className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-ink/90"
            >
              Save
            </button>
          </form>
        </section>
      </div>

      {/* transitions */}
      <div className="rule my-10" />
      <section>
        <div className="eyebrow mb-3">Actions</div>
        {allowedNext.length === 0 ? (
          <p className="text-[13px] text-ink-mid">
            This return has reached a terminal state — no further transitions
            are allowed.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {allowedNext.map((target) => (
              <form key={target} action={transitionReturnAction}>
                <input type="hidden" name="returnId" value={ret.id} />
                <input type="hidden" name="target" value={target} />
                <button
                  type="submit"
                  className="border border-ink/20 bg-white px-4 py-2 text-[11px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white"
                >
                  → {target.toLowerCase()}
                </button>
              </form>
            ))}
          </div>
        )}
        <p className="mt-6 text-[11px] text-ink-mid">
          Customer: {ret.orderEmail} · Created{" "}
          {ret.createdAt.toLocaleString("en-GB")} · Updated{" "}
          {ret.updatedAt.toLocaleString("en-GB")}
        </p>
      </section>
    </div>
  );
}
