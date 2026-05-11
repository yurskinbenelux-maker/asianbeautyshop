// ─────────────────────────────────────────────────────────────────────────
// InventoryPanel — the Inventory tab on /admin/products/[id].
//
// Three stacked sections:
//
//   1. NewVariantForm
//      "Add a size" card at the top. an admin fills in label ("15 ml"),
//      SKU, optional price override, optional opening stock — submits
//      to createVariantAction. Idempotent on SKU collision (P2002 →
//      friendly error).
//
//   2. VariantRowCard (one per existing ProductVariant)
//      Three modes:
//        · view   — shows label, SKU, price-or-inherit badge, stock
//        · stock  — the original "adjust by delta + note" form
//        · edit   — rename label, change SKU, override price, mark
//                   default, set sort order. Posts to updateVariantAction.
//      A separate Delete button trips inline confirmation; if the variant
//      has any past OrderItems the server-side action refuses (history
//      stays intact — an admin archives the parent product instead).
//
//   3. MovementTimeline
//      Flat chronological list of recent InventoryMovement rows across
//      all variants of this product. Same as before.
//
// Why one form per variant instead of a single big form?
//   · Each adjustment is its own atomic thing in an admin's head.
//   · Per-row useActionState lets us scope status messages correctly.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  adjustVariantStockAction,
  createVariantAction,
  deleteVariantAction,
  updateVariantAction,
  type ActionState,
} from "@/app/admin/products/actions";
import { ADMIN_DATETIME_FMT } from "@/lib/utils/format-date";
import type { InventoryRow } from "@/lib/inventory/db";
import { cn } from "@/lib/utils";

// ──────── props ──────────────────────────────────────────────────────────

type VariantRow = {
  id: string;
  sku: string;
  label: string;
  stock: number;
  isDefault: boolean;
  /** Decimal-safe string, e.g. "24.90". Empty string = inherits Product.price. */
  price: string;
  comparePrice: string;
  sortOrder: number;
};

type Props = {
  productId: string;
  /** Product.price as a Decimal-safe string — shown as the inherited
   *  fallback in the "Add variant" form so an admin knows what blank means. */
  productPrice: string;
  variants: VariantRow[];
  movements: InventoryRow[];
};

// ──────── formatting helpers ─────────────────────────────────────────────

const DATE_FMT = ADMIN_DATETIME_FMT;

function formatDate(d: Date): string {
  return DATE_FMT.format(new Date(d));
}

// ──────── reason taxonomy ────────────────────────────────────────────────
//
// Each InventoryReason maps to a label + a Tailwind palette tuple. The
// palette is tuned to communicate at a glance:
//
//   · SALE        — neutral. The dominant case; a coloured pill on every
//                   line would just become noise. Plain ink ring.
//   · RETURN      — sage (positive). RMAs landing back on the shelf; the
//                   one Max wants to spot quickly when reviewing returns.
//   · CANCEL      — ink-mid neutral. Order died before fulfilment, stock
//                   came back without any customer action.
//   · REFUND      — vermilion. Money out the door — the line where an
//                   accountant double-checks the matching refund record.
//   · ADJUSTMENT  — gold. Manual hand-edit; flag for attention because
//                   it bypasses every automated path.
//   · CSV_IMPORT  — ink-mid neutral. Bulk overwrite, expected/non-eventful.
//   · INITIAL     — sage soft. Variant just created, opening stock booked.
//   · OTHER       — ink-mid. Catch-all for anything outside the above.
//
// Keeping the palette muted across the board so multiple pills in a list
// don't read as a Christmas tree. Vermilion + gold are the only "stop and
// look" tones; sage is "all good"; ink is "expected".
type ReasonStyle = {
  label: string;
  classes: string;
};
const REASON_STYLE: Record<string, ReasonStyle> = {
  SALE: {
    label: "Sale",
    classes: "border-ink/20 bg-white text-ink-mid",
  },
  RETURN: {
    label: "Return",
    classes: "border-sage/40 bg-sage/10 text-sage",
  },
  CANCEL: {
    label: "Cancelled",
    classes: "border-ink/20 bg-white text-ink-mid",
  },
  REFUND: {
    label: "Refunded",
    classes: "border-vermilion/40 bg-vermilion/5 text-vermilion",
  },
  ADJUSTMENT: {
    label: "Manual adjust",
    classes: "border-gold/40 bg-gold/10 text-gold",
  },
  CSV_IMPORT: {
    label: "CSV import",
    classes: "border-ink/20 bg-white text-ink-mid",
  },
  INITIAL: {
    label: "Initial",
    classes: "border-sage/30 bg-sage/5 text-sage",
  },
  OTHER: {
    label: "Other",
    classes: "border-ink/20 bg-white text-ink-mid",
  },
};

function ReasonPill({ reason }: { reason: string }) {
  const style = REASON_STYLE[reason] ?? {
    label: reason,
    classes: "border-ink/20 bg-white text-ink-mid",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-0.5 text-[10px] uppercase tracking-label",
        style.classes,
      )}
    >
      {style.label}
    </span>
  );
}

// ──────── root ───────────────────────────────────────────────────────────

export function InventoryPanel({
  productId,
  productPrice,
  variants,
  movements,
}: Props) {
  const totalStock = variants.reduce((n, v) => n + v.stock, 0);

  return (
    <div className="space-y-12">
      {/* ── Summary header ────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink/10 pb-4">
          <div>
            <h2 className="font-display text-[18px] text-ink">Stock</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
              Variants are the sizes / formats customers pick from on the
              product page. Adjust each one&rsquo;s stock individually — every
              change is logged below with a reason and actor.
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

      {/* ── Add a variant ─────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-[11px] uppercase tracking-label text-ink-mid">
          Add a variant
        </h3>
        <NewVariantForm productId={productId} productPrice={productPrice} />
      </section>

      {/* ── Variants ──────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 text-[11px] uppercase tracking-label text-ink-mid">
          Variants
        </h3>
        {variants.length === 0 ? (
          <p className="border border-dashed border-ink/15 bg-white/60 px-4 py-6 text-[12px] text-ink-mid">
            No variants yet. Use the form above to add the first one
            (e.g. <span className="font-display text-ink">15 ml</span> or{" "}
            <span className="font-display text-ink">100 ml</span>).
          </p>
        ) : (
          <div className="space-y-3">
            {variants.map((v) => (
              <VariantRowCard key={v.id} productId={productId} variant={v} />
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

// ──────── new variant form ───────────────────────────────────────────────

const INITIAL_STATE: ActionState = { ok: true };

function NewVariantForm({
  productId,
  productPrice,
}: {
  productId: string;
  productPrice: string;
}) {
  const [state, formAction] = useActionState(
    createVariantAction.bind(null, productId),
    INITIAL_STATE,
  );

  return (
    <form
      action={formAction}
      className="border border-ink/10 bg-white/70 p-5"
      // The action has its own success message; we let useFormState reset
      // form fields by rerendering with key-on-success in a follow-up if
      // an admin asks. For now successful submit just shows the toast and
      // the new row appears below — fields stay so she can add another.
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr,1fr,auto,auto]">
        <Field
          label="Label"
          name="label"
          placeholder="e.g. 15 ml"
          required
          errors={state.fieldErrors?.label}
          hint="Short — what shoppers see on the size selector."
        />
        <Field
          label="SKU"
          name="sku"
          placeholder="YUR-AMP-15ML"
          required
          errors={state.fieldErrors?.sku}
          hint="Internal code. Must be unique site-wide."
        />
        <Field
          label="Price (€)"
          name="price"
          inputMode="decimal"
          placeholder={productPrice}
          errors={state.fieldErrors?.price}
          hint="Blank = inherit product price."
        />
        <Field
          label="Opening stock"
          name="openingStock"
          inputMode="numeric"
          placeholder="0"
          errors={state.fieldErrors?.openingStock}
        />
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-[11px] uppercase tracking-label text-ink-mid hover:text-ink">
          Advanced — compare price · default · sort order
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field
            label="Compare price (€)"
            name="comparePrice"
            inputMode="decimal"
            placeholder=""
            errors={state.fieldErrors?.comparePrice}
            hint="Strike-through 'was' price when on sale."
          />
          <Field
            label="Sort order"
            name="sortOrder"
            inputMode="numeric"
            placeholder="0"
            errors={state.fieldErrors?.sortOrder}
            hint="Lower = earlier in the size selector."
          />
          <Toggle
            name="isDefault"
            label="Default variant"
            sub="Pre-selected on the product page."
          />
        </div>
      </details>

      <div className="mt-5 flex items-center gap-4 border-t border-ink/10 pt-4">
        <SubmitButton idleLabel="Add variant" pendingLabel="Adding…" />
        {state.message && (
          <p
            className={cn(
              "text-[12px]",
              state.ok ? "text-gold" : "text-vermilion",
            )}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

// ──────── variant row ────────────────────────────────────────────────────

type RowMode = "view" | "edit" | "delete";

function VariantRowCard({
  productId,
  variant,
}: {
  productId: string;
  variant: VariantRow;
}) {
  const [mode, setMode] = useState<RowMode>("view");

  return (
    <div className="border border-ink/10 bg-white/70 p-5">
      {/* Head row: label + SKU on the left, stock + actions on the right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[15px] text-ink">
              {variant.label}
            </span>
            {variant.isDefault && (
              <span className="border border-ink/20 px-1.5 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                Default
              </span>
            )}
            {variant.price === "" && (
              <span className="border border-ink/15 px-1.5 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                Inherits price
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-ink-mid">
            {variant.sku}
            {variant.price !== "" && (
              <span className="ml-3 text-ink">€{variant.price}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-label text-ink-mid">
              On hand
            </div>
            <div
              className={cn(
                "mt-0.5 font-display text-[22px]",
                variant.stock <= 3 ? "text-vermilion" : "text-ink",
              )}
            >
              {variant.stock}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <IconButton
              label={mode === "edit" ? "Cancel edit" : "Edit variant"}
              onClick={() => setMode((m) => (m === "edit" ? "view" : "edit"))}
              icon={mode === "edit" ? X : Pencil}
            />
            <IconButton
              label="Delete variant"
              onClick={() =>
                setMode((m) => (m === "delete" ? "view" : "delete"))
              }
              icon={Trash2}
              variant="danger"
            />
          </div>
        </div>
      </div>

      {/* Mode body — adjust stock, edit, or delete confirmation */}
      <div className="mt-5 border-t border-ink/10 pt-4">
        {mode === "view" && (
          <AdjustStockForm productId={productId} variant={variant} />
        )}
        {mode === "edit" && (
          <EditVariantForm
            productId={productId}
            variant={variant}
            onDone={() => setMode("view")}
          />
        )}
        {mode === "delete" && (
          <DeleteVariantForm
            productId={productId}
            variant={variant}
            onCancel={() => setMode("view")}
          />
        )}
      </div>
    </div>
  );
}

// ──────── adjust-stock (existing form, unchanged behaviour) ──────────────

function AdjustStockForm({
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

  return (
    <form
      action={formAction}
      className="grid gap-3 sm:grid-cols-[120px,1fr,auto] sm:items-start"
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
        <SubmitButton idleLabel="Update stock" pendingLabel="Saving…" />
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
  );
}

// ──────── edit form ──────────────────────────────────────────────────────

function EditVariantForm({
  productId,
  variant,
  onDone,
}: {
  productId: string;
  variant: VariantRow;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(
    updateVariantAction.bind(null, productId),
    INITIAL_STATE,
  );

  // Auto-collapse back to view-mode on a successful save. We watch the
  // server's ok+message; the parent owns the mode state.
  if (state.ok && state.message === "Variant saved.") {
    // Defer to the next microtask so the toast still flashes.
    queueMicrotask(onDone);
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="variantId" value={variant.id} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Label"
          name="label"
          defaultValue={variant.label}
          required
          errors={state.fieldErrors?.label}
        />
        <Field
          label="SKU"
          name="sku"
          defaultValue={variant.sku}
          required
          errors={state.fieldErrors?.sku}
        />
        <Field
          label="Price (€)"
          name="price"
          inputMode="decimal"
          defaultValue={variant.price}
          errors={state.fieldErrors?.price}
          hint="Blank inherits."
        />
        <Field
          label="Compare price (€)"
          name="comparePrice"
          inputMode="decimal"
          defaultValue={variant.comparePrice}
          errors={state.fieldErrors?.comparePrice}
          hint="Strike-through."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Sort order"
          name="sortOrder"
          inputMode="numeric"
          defaultValue={String(variant.sortOrder)}
          errors={state.fieldErrors?.sortOrder}
        />
        <div className="sm:col-span-2">
          <Toggle
            name="isDefault"
            label="Default variant"
            sub="Pre-selected on the product page."
            defaultChecked={variant.isDefault}
          />
        </div>
      </div>
      <div className="flex items-center gap-4 border-t border-ink/10 pt-3">
        <SubmitButton idleLabel="Save variant" pendingLabel="Saving…" />
        <button
          type="button"
          onClick={onDone}
          className="text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
        >
          Cancel
        </button>
        {state.message && (
          <p
            className={cn(
              "text-[12px]",
              state.ok ? "text-gold" : "text-vermilion",
            )}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

// ──────── delete confirmation ────────────────────────────────────────────

function DeleteVariantForm({
  productId,
  variant,
  onCancel,
}: {
  productId: string;
  variant: VariantRow;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(
    deleteVariantAction.bind(null, productId),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="variantId" value={variant.id} />
      <p className="text-[13px] text-ink">
        Delete <span className="font-display">{variant.label}</span> (
        <span className="font-mono text-ink-mid">{variant.sku}</span>)?{" "}
        <span className="text-ink-mid">
          The action will refuse if any past order references it.
        </span>
      </p>
      <div className="flex items-center gap-4">
        <SubmitButton
          idleLabel="Delete"
          pendingLabel="Deleting…"
          variant="danger"
        />
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
        >
          Cancel
        </button>
        {state.message && (
          <p
            className={cn(
              "text-[12px]",
              state.ok ? "text-gold" : "text-vermilion",
            )}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

// ──────── movement timeline ─────────────────────────────────────────────

function MovementTimeline({ rows }: { rows: InventoryRow[] }) {
  return (
    <ul className="border border-ink/10">
      {rows.map((m) => (
        <li
          key={m.id}
          className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/10 px-5 py-3 last:border-b-0"
        >
          <div className="flex items-baseline gap-3">
            <span
              className={cn(
                "inline-flex min-w-[3.5rem] justify-center border px-2 py-0.5 font-mono text-[11px]",
                m.delta > 0
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-vermilion/40 bg-vermilion/10 text-vermilion",
              )}
            >
              {m.delta > 0 ? `+${m.delta}` : m.delta}
            </span>
            <span className="text-[13px] text-ink">
              {m.variantSku}{" "}
              <span className="text-ink-mid">— {m.variantLabel}</span>
            </span>
            <ReasonPill reason={m.reason} />
          </div>
          <div className="text-right text-[11px] text-ink-mid">
            <div>{formatDate(m.createdAt)}</div>
            {m.actorEmail && <div>{m.actorEmail}</div>}
            {m.note && (
              <div className="italic text-ink-mid/80">&ldquo;{m.note}&rdquo;</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ──────── atoms ──────────────────────────────────────────────────────────

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  inputMode,
  required,
  hint,
  errors,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
  required?: boolean;
  hint?: string;
  errors?: string[];
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </label>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        required={required}
        className={cn(
          "mt-1 w-full border bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:outline-none",
          errors?.length
            ? "border-vermilion focus:border-vermilion"
            : "border-ink/15 focus:border-ink",
        )}
      />
      {hint && !errors?.length && (
        <p className="mt-1 text-[11px] text-ink-mid">{hint}</p>
      )}
      {errors?.length ? (
        <p className="mt-1 text-[11px] text-vermilion">{errors[0]}</p>
      ) : null}
    </div>
  );
}

function Toggle({
  name,
  label,
  sub,
  defaultChecked,
}: {
  name: string;
  label: string;
  sub: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex h-full cursor-pointer items-start gap-3 border border-ink/10 bg-white/60 px-4 py-3 hover:border-ink/25">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 accent-ink"
      />
      <span>
        <span className="block text-[13px] text-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-ink-mid">
          {sub}
        </span>
      </span>
    </label>
  );
}

function IconButton({
  label,
  onClick,
  icon: Icon,
  variant,
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center border bg-white transition-colors",
        variant === "danger"
          ? "border-vermilion/30 text-vermilion hover:border-vermilion hover:bg-vermilion hover:text-white"
          : "border-ink/15 text-ink-mid hover:border-ink hover:text-ink",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  variant,
}: {
  idleLabel: string;
  pendingLabel: string;
  variant?: "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-2 border px-5 py-2 text-[12px] uppercase tracking-label transition-colors disabled:opacity-50",
        variant === "danger"
          ? "border-vermilion bg-vermilion text-white hover:bg-vermilion-deep"
          : "border-ink bg-ink text-white hover:bg-ink/90",
      )}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
