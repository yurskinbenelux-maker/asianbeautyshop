// ─────────────────────────────────────────────────────────────────────────
// BasicsForm — the first tab of the product editor.
//
// Client component so we can use `useActionState` + `useFormStatus` for
// inline save feedback. Posts to `updateBasics` (Server Action). Renders
// field-level Zod errors below each input.
//
// Note on prices: we keep them as strings in the form and let the Server
// Action parse to Prisma.Decimal — parseFloat on "24.90" is exact at this
// step but breaks for e.g. "19.99" due to binary float. Strings are safe.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ProductStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { updateBasics, type ActionState } from "@/app/admin/products/actions";

type Initial = {
  sku: string;
  status: ProductStatus;
  isFeatured: boolean;
  isBestseller: boolean;
  isAvailableForAi: boolean;
  hideFromSearch: boolean;
  price: string;
  comparePrice: string;
  volumeMl: string;
  weightGrams: string;
};

const INITIAL_STATE: ActionState = { ok: true };

export function BasicsForm({
  productId,
  initial,
}: {
  productId: string;
  initial: Initial;
}) {
  // useActionState keeps the last ActionState across submits so we can
  // surface success/error messages and field errors without losing input.
  const [state, formAction] = useActionState(
    updateBasics.bind(null, productId),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-10">
      {/* ── Identity ──────────────────────────────────────────────── */}
      <Section
        title="Identity"
        hint="The SKU is your internal code (printed on invoices). Status controls whether shoppers can see this product."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="SKU"
            name="sku"
            defaultValue={initial.sku}
            required
            errors={state.fieldErrors?.sku}
          />

          <div>
            <Label>Status</Label>
            <select
              name="status"
              defaultValue={initial.status}
              className="mt-1 w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
            >
              <option value="DRAFT">Draft · hidden from shop</option>
              <option value="PUBLISHED">Published · live on shop</option>
              <option value="ARCHIVED">Archived · kept for records</option>
            </select>
          </div>
        </div>
      </Section>

      {/* ── Price ─────────────────────────────────────────────────── */}
      <Section
        title="Price"
        hint="Leave compare price empty when the product is not on sale."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Price (€)"
            name="price"
            inputMode="decimal"
            placeholder="24.90"
            defaultValue={initial.price}
            required
          />
          <Field
            label="Compare price (€)"
            name="comparePrice"
            inputMode="decimal"
            placeholder="e.g. 29.90"
            defaultValue={initial.comparePrice}
            hint="Shown struck-through when set."
          />
        </div>
      </Section>

      {/* ── Physical ──────────────────────────────────────────────── */}
      <Section
        title="Physical"
        hint="Volume shows on the product page as a ml badge. Weight is used by Sendcloud to quote shipping."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Volume (ml)"
            name="volumeMl"
            inputMode="numeric"
            placeholder="50"
            defaultValue={initial.volumeMl}
            errors={state.fieldErrors?.volumeMl}
          />
          <Field
            label="Weight (g)"
            name="weightGrams"
            inputMode="numeric"
            placeholder="120"
            defaultValue={initial.weightGrams}
            errors={state.fieldErrors?.weightGrams}
          />
        </div>
      </Section>

      {/* ── Visibility toggles ────────────────────────────────────── */}
      <Section
        title="Surface"
        hint="Where this product should show up across the site."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle
            name="isFeatured"
            label="Featured"
            sub="Appears in curated homepage modules."
            defaultChecked={initial.isFeatured}
          />
          <Toggle
            name="isBestseller"
            label="Bestseller"
            sub="Adds to the homepage bestsellers rail."
            defaultChecked={initial.isBestseller}
          />
          <Toggle
            name="isAvailableForAi"
            label="Recommendable by AI concierge"
            sub="Allow the assistant to suggest this product."
            defaultChecked={initial.isAvailableForAi}
          />
          <Toggle
            name="hideFromSearch"
            label="Hide from search"
            sub="Product still exists but won't show in search results."
            defaultChecked={initial.hideFromSearch}
          />
        </div>
      </Section>

      {/* ── submit ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 border-t border-ink/10 pt-6">
        <SubmitButton />
        <StatusMessage state={state} />
      </div>
    </form>
  );
}

// ──────── atoms ───────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-[18px] text-ink">{title}</h2>
        {hint && (
          <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] uppercase tracking-label text-ink-mid">
      {children}
    </label>
  );
}

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
      <Label>{label}</Label>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        required={required}
        className={cn(
          "mt-1 w-full border bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:outline-none",
          errors && errors.length > 0
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
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 border border-ink/10 bg-white/60 px-4 py-3 hover:border-ink/25">
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

function StatusMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={cn(
        "text-[12px]",
        state.ok ? "text-gold" : "text-vermilion",
      )}
    >
      {state.message}
    </p>
  );
}
