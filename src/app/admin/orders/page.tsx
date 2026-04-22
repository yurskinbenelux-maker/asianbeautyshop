// ─────────────────────────────────────────────────────────────────────────
// /admin/orders — the order management table.
//
// Server component: queries admin-orders.ts directly. Filters are URL-driven
// so the list is bookmarkable and the back button just works.
//
//   ?q=…            — search publicNumber / email / mollie id / name
//   ?status=PAID    — filter by OrderStatus
//   ?paymentStatus= — filter by PaymentStatus
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD — date range on placedAt
//   ?page=2         — pagination
//   ?size=50        — page size (10-200)
//
// Bulk actions: checkboxes compose an array of orderIds, submitted via a
// server action. We only keep one bulk action in MVP (mark fulfilling);
// more can hang off the same pattern later.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Download, Search } from "lucide-react";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import {
  adminOrderCounts,
  listAdminOrders,
} from "@/lib/queries/admin-orders";
import { cn } from "@/lib/utils";
import { BulkFulfillingForm } from "@/components/admin/orders/bulk-actions";

export const dynamic = "force-dynamic";

// Labels moved to @/lib/orders/labels — Next.js 15 disallows non-reserved
// named exports from page files.
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/orders/labels";

// Visual treatment per status. Kept muted — the admin scans hundreds of
// rows at once and doesn't need a rainbow.
const STATUS_CLASS: Record<OrderStatus, string> = {
  PENDING: "bg-ink/5 text-ink-mid",
  PAID: "bg-gold/15 text-gold",
  FULFILLING: "bg-sage/15 text-sage",
  SHIPPED: "bg-ink text-white",
  DELIVERED: "bg-ink/80 text-white",
  CANCELLED: "bg-vermilion/10 text-vermilion",
  REFUNDED: "bg-vermilion/15 text-vermilion",
  PARTIALLY_REFUNDED: "bg-vermilion/10 text-vermilion",
};

const PAYMENT_CLASS: Record<PaymentStatus, string> = {
  UNPAID: "bg-ink/5 text-ink-mid",
  AUTHORIZED: "bg-gold/10 text-gold",
  PAID: "bg-gold/15 text-gold",
  FAILED: "bg-vermilion/10 text-vermilion",
  REFUNDED: "bg-vermilion/15 text-vermilion",
  PARTIALLY_REFUNDED: "bg-vermilion/10 text-vermilion",
};

// ──────── page ──────────────────────────────────────────────────────────

type SearchParams = Promise<{
  q?: string;
  status?: string;
  paymentStatus?: string;
  from?: string;
  to?: string;
  page?: string;
  size?: string;
}>;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const status = isOrderStatus(sp.status) ? sp.status : undefined;
  const paymentStatus = isPaymentStatus(sp.paymentStatus)
    ? sp.paymentStatus
    : undefined;

  const from = parseDate(sp.from);
  const to = parseDate(sp.to);
  // Make `to` inclusive: shift to end-of-day. Admins type "2026-04-20" and
  // expect orders placed *on* that date to be included.
  const toInclusive =
    to !== undefined
      ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999)
      : undefined;

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = clampSize(Number(sp.size));

  const [result, counts] = await Promise.all([
    listAdminOrders({
      q: sp.q,
      status,
      paymentStatus,
      from,
      to: toInclusive,
      page,
      pageSize,
    }),
    adminOrderCounts({ q: sp.q, from, to: toInclusive }),
  ]);

  const hasFilters =
    Boolean(sp.q) ||
    Boolean(status) ||
    Boolean(paymentStatus) ||
    Boolean(sp.from) ||
    Boolean(sp.to);

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      {/* masthead */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Commerce</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            Orders
          </h1>
          <p className="mt-2 text-[13px] text-ink-mid">
            {counts.total} total · {formatMoney(counts.revenue)} revenue from paid orders
          </p>
        </div>

        {/*
          Two exports, both filter-aware.
           · Export CSV        — one row per order (operations / fulfilment)
           · Export line items — one row per OrderItem, with ex-tax + VAT
                                 columns. This is the shape Sofia's
                                 accountant asked for.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={buildExportHref(sp)}
            className="inline-flex items-center gap-2 border border-ink/20 bg-white px-4 py-2 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white"
            title="One row per order — for fulfilment and customer-level reporting"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
          <a
            href={buildExportHref(sp, "items")}
            className="inline-flex items-center gap-2 border border-ink/20 bg-white px-4 py-2 text-[12px] uppercase tracking-label text-ink-mid transition-colors hover:border-ink hover:bg-ink hover:text-white"
            title="One row per product line — includes SKU, ex-tax and VAT columns for accounting"
          >
            <Download className="h-4 w-4" />
            Line items
          </a>
        </div>
      </header>

      {/* filters */}
      <form
        method="get"
        className="mt-10 grid grid-cols-1 gap-4 border-t border-ink/10 pt-6 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid" />
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search by order #, email, name, Mollie id…"
            className="w-full border border-ink/15 bg-white py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
          />
        </div>

        <SelectField
          name="status"
          value={status ?? ""}
          placeholder="Any status"
          options={Object.values(OrderStatus).map((s) => ({
            value: s,
            label: ORDER_STATUS_LABELS[s],
          }))}
        />
        <SelectField
          name="paymentStatus"
          value={paymentStatus ?? ""}
          placeholder="Any payment"
          options={Object.values(PaymentStatus).map((s) => ({
            value: s,
            label: PAYMENT_STATUS_LABELS[s],
          }))}
        />

        <div className="flex items-center gap-2">
          <DateField name="from" value={sp.from ?? ""} label="From" />
          <DateField name="to" value={sp.to ?? ""} label="To" />
        </div>

        <div className="md:col-span-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid">
            <span>Page size</span>
            <select
              name="size"
              defaultValue={String(pageSize)}
              className="border border-ink/15 bg-white px-2 py-1 text-[12px] text-ink focus:border-ink focus:outline-none"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {hasFilters && (
              <Link
                href="/admin/orders"
                className="border border-ink/15 px-3 py-2 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
              >
                Clear
              </Link>
            )}
            <button
              type="submit"
              className="border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-white hover:bg-ink/90"
            >
              Apply
            </button>
          </div>
        </div>
      </form>

      {/* status filter pills */}
      <div className="mt-6 flex flex-wrap gap-1 text-[11px] uppercase tracking-label">
        <StatusPill
          label={`All · ${counts.total}`}
          href={buildFilterHref(sp, { status: null })}
          active={!status}
        />
        {Object.values(OrderStatus).map((s) => (
          <StatusPill
            key={s}
            label={`${ORDER_STATUS_LABELS[s]} · ${counts.byStatus[s]}`}
            href={buildFilterHref(sp, { status: s })}
            active={status === s}
          />
        ))}
      </div>

      {/* table (wrapped in a bulk-action form so the checkboxes matter) */}
      <BulkFulfillingForm>
        <div className="mt-6 border border-ink/10 bg-white/60">
          {result.rows.length === 0 ? (
            <EmptyState hasFilters={hasFilters} />
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
                  <Th className="w-[42px] text-center">
                    {/* select-all is best-effort client-side; SSR table can't
                        own checkbox state, so we skip a master checkbox for
                        MVP and let Sofia click each row. */}
                    <span className="sr-only">Select</span>
                  </Th>
                  <Th className="w-[14%]">Order</Th>
                  <Th className="w-[24%]">Customer</Th>
                  <Th>Status</Th>
                  <Th>Payment</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Placed</Th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]"
                  >
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        name="orderIds"
                        value={o.id}
                        className="h-3.5 w-3.5 cursor-pointer accent-ink"
                        aria-label={`Select ${o.publicNumber}`}
                      />
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono text-[12px] text-ink hover:underline"
                      >
                        {o.publicNumber}
                      </Link>
                      {o.isGuest && (
                        <div className="mt-0.5 text-[10px] uppercase tracking-label text-ink-mid/70">
                          Guest
                        </div>
                      )}
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="block text-ink hover:underline"
                      >
                        <div className="truncate">
                          {o.customerName ?? o.email}
                        </div>
                        {o.customerName && (
                          <div className="truncate text-[11px] text-ink-mid">
                            {o.email}
                          </div>
                        )}
                      </Link>
                    </Td>
                    <Td>
                      <Badge
                        label={ORDER_STATUS_LABELS[o.status]}
                        className={STATUS_CLASS[o.status]}
                      />
                    </Td>
                    <Td>
                      <Badge
                        label={PAYMENT_STATUS_LABELS[o.paymentStatus]}
                        className={PAYMENT_CLASS[o.paymentStatus]}
                      />
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(o.grandTotal, o.currency)}
                      <div className="text-[10px] uppercase tracking-label text-ink-mid/70">
                        {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                      </div>
                    </Td>
                    <Td className="text-ink-mid">{formatDate(o.placedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </BulkFulfillingForm>

      {/* pagination */}
      {result.totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-6 flex items-center justify-between text-[12px] text-ink-mid"
        >
          <div>
            Page {result.page} of {result.totalPages} · {result.total} orders
          </div>
          <div className="flex items-center gap-2">
            {result.page > 1 && (
              <Link
                href={buildFilterHref(sp, { page: String(result.page - 1) })}
                scroll={false}
                className="border border-ink/15 px-3 py-1.5 uppercase tracking-label hover:border-ink hover:text-ink"
              >
                Previous
              </Link>
            )}
            {result.page < result.totalPages && (
              <Link
                href={buildFilterHref(sp, { page: String(result.page + 1) })}
                scroll={false}
                className="border border-ink/15 px-3 py-1.5 uppercase tracking-label hover:border-ink hover:text-ink"
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

// ──────── small building blocks ────────────────────────────────────────

function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === "string" && (Object.values(OrderStatus) as string[]).includes(v);
}
function isPaymentStatus(v: unknown): v is PaymentStatus {
  return typeof v === "string" && (Object.values(PaymentStatus) as string[]).includes(v);
}
function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function clampSize(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(200, Math.max(10, Math.floor(n)));
}

function formatMoney(n: number, currency = "EUR") {
  const symbol = currency === "EUR" ? "€" : currency;
  return `${symbol} ${n.toFixed(2)}`;
}
function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildFilterHref(
  sp: Record<string, string | undefined>,
  patch: Partial<Record<string, string | null>>,
): string {
  const params = new URLSearchParams();
  // Seed with existing, then apply patch.
  for (const [k, v] of Object.entries(sp)) {
    if (v) params.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") params.delete(k);
    else params.set(k, v);
  }
  // Reset page when changing a non-page filter — otherwise admin lands
  // on page 5 of a filter that only has 2 pages.
  if (!("page" in patch)) params.delete("page");
  const qs = params.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}

/**
 * Build the export URL, carrying forward every filter except paging.
 * The optional `format` arg switches between the order-summary CSV (default)
 * and the line-items CSV that Sofia's accountant uses for VAT filings.
 */
function buildExportHref(
  sp: Record<string, string | undefined>,
  format?: "summary" | "items",
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "page" && k !== "size") params.set(k, v);
  }
  if (format && format !== "summary") params.set("format", format);
  const qs = params.toString();
  return qs ? `/admin/orders/export?${qs}` : "/admin/orders/export";
}

function StatusPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "border px-2.5 py-1 transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-ink/15 text-ink-mid hover:border-ink hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={cn("px-4 py-3 font-normal", className)}>{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

function Badge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-label",
        className,
      )}
    >
      {label}
    </span>
  );
}

function SelectField({
  name,
  value,
  placeholder,
  options,
}: {
  name: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      name={name}
      defaultValue={value}
      className="border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function DateField({
  name,
  value,
  label,
}: {
  name: string;
  value: string;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-mid">
      {label}
      <input
        type="date"
        name={name}
        defaultValue={value}
        className="border border-ink/15 bg-white px-2 py-1.5 text-[12px] text-ink focus:border-ink focus:outline-none"
      />
    </label>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="font-display text-[22px] text-ink">
        {hasFilters ? "No orders match" : "No orders yet"}
      </div>
      <p className="mt-2 max-w-sm text-[13px] text-ink-mid">
        {hasFilters
          ? "Try relaxing your filters or clearing the search."
          : "When a customer checks out, their order will appear here."}
      </p>
    </div>
  );
}
