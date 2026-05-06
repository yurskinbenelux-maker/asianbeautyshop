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
import { AudienceCategory, ProductStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { updateBasics, type ActionState } from "@/app/admin/products/actions";

type Initial = {
  sku: string;
  status: ProductStatus;
  isFeatured: boolean;
  isBestseller: boolean;
  isAvailableForAi: boolean;
  hideFromSearch: boolean;
  // ─── Sale flags (per-product discount) ──────────────────────────────
  // Set isOnSale true and salePercent to a 1-90 number to put this
  // product on sale. The storefront renders the regular price
  // strikethrough above the discounted price + a "−X%" chip.
  isOnSale: boolean;
  salePercent: string;
  price: string;
  comparePrice: string;
  volumeMl: string;
  weightGrams: string;
  // ─── Supplier-spec fields (xlsx round-trip) ─────────────────────────
  productLine: string;
  barcode: string;
  shelfLifeMonths: string;
  originCountry: string;       // ISO-3166 alpha-2
  hsCode: string;
  audienceCategory: AudienceCategory;
  inciList: string;
};

// User-friendly labels for the audience dropdown — keep order stable so
// UNISEX (the default for ~90 % of K-beauty) is the first option.
const AUDIENCE_LABEL: Record<AudienceCategory, string> = {
  UNISEX: "Unisex (default)",
  WOMEN: "Women",
  MEN: "Men",
  KIDS: "Kids",
  BABIES: "Babies",
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
        hint="Volume shows on the product page as a ml badge. Weight is used by Sendcloud to quote shipping. Shelf life appears in the product details panel for customers."
      >
        <div className="grid gap-6 sm:grid-cols-3">
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
          <Field
            label="Shelf life (months)"
            name="shelfLifeMonths"
            inputMode="numeric"
            placeholder="36"
            defaultValue={initial.shelfLifeMonths}
            hint="Unopened. PAO (after-opening) is separate."
            errors={state.fieldErrors?.shelfLifeMonths}
          />
        </div>
      </Section>

      {/* ── Supplier / compliance ─────────────────────────────────── */}
      {/* Honors the columns from Sofia's master-data sheet. Origin and
          audience surface on the public PDP; barcode + HS code are for
          ops (returns scanning, customs paperwork, retail compliance). */}
      <Section
        title="Supplier &amp; compliance"
        hint="Mirrors the supplier data sheet. Barcode is the EAN-13 from the manufacturer; HS code is for customs paperwork."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Product line"
            name="productLine"
            placeholder="e.g. Yu.R PRO"
            defaultValue={initial.productLine}
            hint="Sub-brand within YU.R, if any."
          />
          <Field
            label="Barcode (EAN / UPC / GTIN)"
            name="barcode"
            inputMode="numeric"
            placeholder="8809085104847"
            defaultValue={initial.barcode}
            hint="Digits only. 8–14 characters."
            errors={state.fieldErrors?.barcode}
          />
          <Field
            label="Country of origin (ISO-2)"
            name="originCountry"
            placeholder="KR"
            defaultValue={initial.originCountry}
            hint="Two-letter code, e.g. KR for South Korea."
            errors={state.fieldErrors?.originCountry}
          />
          <Field
            label="HS code"
            name="hsCode"
            inputMode="numeric"
            placeholder="3304991000"
            defaultValue={initial.hsCode}
            hint="Customs classification (Sendcloud, invoices)."
            errors={state.fieldErrors?.hsCode}
          />
          <div>
            <Label>Audience</Label>
            <select
              name="audienceCategory"
              defaultValue={initial.audienceCategory}
              className="mt-1 w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
            >
              {(Object.keys(AUDIENCE_LABEL) as AudienceCategory[]).map((k) => (
                <option key={k} value={k}>
                  {AUDIENCE_LABEL[k]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-ink-mid">
              Most YU.R products are unisex. Used for the audience filter.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Full INCI ─────────────────────────────────────────────── */}
      {/* Language-agnostic — INCI nomenclature is the same in every
          locale. Stored once on Product, rendered as an accordion on
          the customer PDP under "Full ingredient list". */}
      <Section
        title="Full ingredient list (INCI)"
        hint="The complete declaration as it appears on the packaging. One paragraph, comma-separated, no formatting needed."
      >
        <textarea
          name="inciList"
          defaultValue={initial.inciList}
          rows={6}
          placeholder="Water, Glycerin, Sodium Hyaluronate, …"
          className="w-full border border-ink/15 bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        />
      </Section>

      {/* ── Sale ──────────────────────────────────────────────────────
          Per-product discount. Toggle "On sale" + enter a percent and
          the storefront automatically:
            · shows the regular price strikethrough
            · shows the discounted price in vermilion
            · adds a "−X%" chip
            · stamps cart lines with discountReason='sale' so coupons
              don't stack on top of the markdown
            · respects the same price downstream (Mollie, Order, points). */}
      <Section
        title="Sale"
        hint="Per-product markdown. The discount applies wherever the product is shown — shop grid, PDP, cart, checkout — and customers can't stack a coupon on top."
      >
        <div className="space-y-4">
          <Toggle
            name="isOnSale"
            label="On sale"
            sub="When ticked, the discount below applies."
            defaultChecked={initial.isOnSale}
          />
          <label className="block max-w-xs">
            <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
              Sale discount %
            </span>
            <div className="flex items-stretch border border-ink/15 bg-white focus-within:border-ink">
              <input
                type="number"
                name="salePercent"
                defaultValue={initial.salePercent}
                min={1}
                max={90}
                step={1}
                placeholder="e.g. 30"
                className="w-full border-0 bg-transparent px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:outline-none"
              />
              <span className="flex items-center border-l border-ink/15 bg-rice-dim/40 px-3 text-[11px] uppercase tracking-label text-ink-mid">
                %
              </span>
            </div>
            <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
              1-90. Only applied when &ldquo;On sale&rdquo; is ticked.
            </span>
          </label>
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
