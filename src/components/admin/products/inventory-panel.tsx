// ─────────────────────────────────────────────────────────────────────────
// InventoryPanel — the Inventory tab on /admin/products/[id].
//
// Two stacked sections:
//
//   1. VariantList
//      One row per ProductVariant with its current stock and an inline
//      "Adjust stock" form (signed delta + optional note). Posts to
//      adjustVariantStockAction which runs applyMovement under the hood —
//      so stock update and movement log are one atomic transaction.
//
//   2. MovementTimeline
//      Flat chronological list of up to 200 recent InventoryMovement rows
//      across all variants of this product. Renders delta pill, reason,
//      linked order (if any), actor email, optional note, timestamp.
//
// Why one form per variant instead of a single big form?
//   · Each adjustment is its own atomic thing in Sofia's head ("+12 to
//     Small, -3 to Large" is two actions, not one). Separate forms keep
//     the status messages scoped to the relevant row.
//   · The Server Action returns a per-row ActionState via useActionState,
//     so we can surface "Stock clamped at 0" on the specific row without
//     confusion.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  adjustVariantStockAction,
  type ActionState,
} from "@/app/admin/products/actions";
import type { InventoryRow } from "@/lib/inventory/db";
import { cn } from "@/lib/utils";

// ──────── props ──────────────────────────────────────────────────────────

type VariantRow = {
  id: string;
  sku: string;
  label: string;
  stock: number;
  isDefault: boolean;
};

type Props = {
  productId: string;
  variants: VariantRow[];
  movements: InventoryRow[];
};

// ──────── formatting helpers ─────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(d: Date): string {
  return DATE_FMT.format(new Date(d));
}

const REASON_LABEL: Record<string, string> = {
  SALE: "Sale",
  CANCEL: "Cancelled",
  REFUND: "Refunded",
  RETURN: "Return",
  ADJUSTMENT: "Manual adjust",
  CSV_IMPORT: "CSV import",
  INITIAL: "Initial",
  OTHER: "Other",
};

function reasonLabel(r: string): string {
  return REASON_LABEL[r] ?? r;
}

// ──────── root ───────────────────────────────────────────────────────────

export function InventoryPanel({ productId, variants, movements }: Props) {
  const totalStock = variants.reduce((n, v) => n + v.stock, 0);

  return (
    <div className="space-y-12">
      {/* ── Summary header ────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink/10 pb-4">
          <div>
            <h2 className="font-display text-[18px] text-ink">Stock</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
              Adjust each variant individually. Every change is logged below
              with a reason and actor — use this when you count a box, find
              damage, or need to correct an import.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-label text-ink-mid">
              Total on hand
            </div>
            <div className="mt-1 font-display text-[26px] text-ink">
              {totalStock}
            </div>
          </div>
        </div>
      </section>

      {/* ── Variants ──────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-[11px] uppercase tracking-label text-ink-mid">
          Variants
        </h3>
        {variants.length === 0 ? (
          <p className="border border-dashed border-ink/15 bg-white/60 px-4 py-6 text-[12px] text-ink-mid">
            No variants yet. Add at least one variant on the Variants tab
            before adjusting stock.
          </p>
        ) : (
          <div className="space-y-3">
            {variants.map((v) => (
              <VariantRowCard
                key={v.id}
                productId={productId}
                variant={v}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Movement timeline ─────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-[11px] uppercase tracking-label text-ink-mid">
          Recent movements
        </h3>
        {movements.length === 0 ? (
          <p className="border border-dashed border-ink/15 bg-white/60 px-4 py-6 text-[12px] text-ink-mid">
            No movements recorded yet. Once orders ship or you adjust stock,
            a full audit trail will appear here.
          </p>
        ) : (
          <MovementTimeline rows={movements} />
        )}
      </section>
    </div>
  );
}

// ──────── variant row ────────────────────────────────────────────────────

const INITIAL_STATE: ActionState = { ok: true };

function VariantRowCard({
  productId,
  variant,
}: {
  productId: string;
  variant: VariantRow;
}) {
  const [state, formAction] = useActionState(
    adjustVariantStockAction.bind(null, productId),
    INITIAL_STATE,
  );

  const lowStock = variant.stock <= 3;

  return (
    <div className="border border-ink/10 bg-white/70 p-5">
      {/* Head row: SKU, label, stock badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] text-ink">
              {variant.label}
            </span>
            {variant.isDefault && (
              <span className="border border-ink/20 px-1.5 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                Default
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-ink-mid">
            {variant.sku}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-label text-ink-mid">
            On hand
          </div>
          <div
            className={cn(
              "mt-0.5 font-display text-[22px]",
              lowStock ? "text-vermilion" : "text-ink",
            )}
          >
            {variant.stock}
          </div>
        </div>
      </div>

      {/* Adjust form */}
      <form
        action={formAction}
        className="mt-5 grid gap-3 border-t border-ink/10 pt-4 sm:grid-cols-[120px,1fr,auto] sm:items-start"
      >
        <input type="hidden" name="variantId" value={variant.id} />

        <div>
          <label
            htmlFor={`delta-${variant.id}`}
            className="block text-[11px] uppercase tracking-label text-ink-mid"
          >
            Delta
          </label>
          <input
            id={`delta-${variant.id}`}
            name="delta"
            inputMode="numeric"
            placeholder="+12 or -3"
            required
            className={cn(
              "mt-1 w-full border bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:outline-none",
              state.fieldErrors?.delta
                ? "border-vermilion focus:border-vermilion"
                : "border-ink/15 focus:border-ink",
            )}
          />
          {state.fieldErrors?.delta?.[0] && (
            <p className="mt-1 text-[11px] text-vermilion">
              {state.fieldErrors.delta[0]}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={`note-${variant.id}`}
            className="block text-[11px] uppercase tracking-label text-ink-mid"
          >
            Note <span className="normal-case text-ink-mid/60">(optional)</span>
          </label>
          <input
            id={`note-${variant.id}`}
            name="note"
            type="text"
            maxLength={500}
            placeholder="e.g. Counted shelf · found damaged unit"
            className="mt-1 w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
          />
        </div>

        <div className="flex items-end sm:justify-end">
          <SubmitButton />
        </div>

        {state.message && (
          <div className="sm:col-span-3">
            <p
              className={cn(
                "text-[12px]",
                state.ok ? "text-gold" : "text-vermilion",
              )}
            >
              {state.message}
            </p>
          </div>
        )}
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-[38px] items-center gap-2 border border-ink bg-ink px-4 text-[11px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Apply"}
    </button>
  );
}

// ──────── movement timeline ──────────────────────────────────────────────

function MovementTimeline({ rows }: { rows: InventoryRow[] }) {
  return (
    <ol className="space-y-0 border border-ink/10 bg-white/70">
      {rows.map((r, i) => (
        <li
          key={r.id}
          className={cn(
            "grid gap-2 px-4 py-3 sm:grid-cols-[110px,120px,140px,1fr,auto] sm:items-center",
            i < rows.length - 1 && "border-b border-ink/10",
          )}
        >
          {/* Delta pill */}
          <div>
            <span
              className={cn(
                "inline-flex min-w-[60px] justify-center border px-2 py-1 font-mono text-[12px]",
                r.delta > 0
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-vermilion/40 bg-vermilion/5 text-vermilion",
              )}
            >
              {r.delta > 0 ? "+" : ""}
              {r.delta}
            </span>
          </div>

          {/* Reason */}
          <div className="text-[12px] text-ink">{reasonLabel(r.reason)}</div>

          {/* Variant */}
          <div className="min-w-0">
            <div className="truncate text-[12px] text-ink">
              {r.variantLabel}
            </div>
            <div className="truncate font-mono text-[10px] text-ink-mid">
              {r.variantSku}
            </div>
          </div>

          {/* Context: order number + note + actor */}
          <div className="min-w-0 text-[11px] text-ink-mid">
            {r.orderNumber && (
              <span className="mr-2 font-mono text-ink">
                {r.orderNumber}
              </span>
            )}
            {r.note && <span className="italic">{r.note}</span>}
            {!r.note && !r.orderNumber && (
              <span className="text-ink-mid/60">—</span>
            )}
            {r.actorEmail && (
              <span className="block truncate text-[10px] text-ink-mid/80">
                by {r.actorEmail}
              </span>
            )}
          </div>

          {/* After + date */}
          <div className="text-right">
            <div className="text-[11px] text-ink-mid">
              After:{" "}
              <span className="font-mono text-ink">{r.stockAfter}</span>
            </div>
            <div className="mt-0.5 text-[10px] text-ink-mid/80">
              {formatDate(r.createdAt)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
