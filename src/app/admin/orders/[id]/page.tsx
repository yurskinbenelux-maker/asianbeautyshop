// ─────────────────────────────────────────────────────────────────────────
// /admin/orders/[id] — the order detail & management surface.
//
// Layout is two-column on wide screens:
//   • LEFT  — line items, totals, addresses, customer, payment references
//   • RIGHT — status actions, tracking form, refund form, admin notes,
//             invoice URL, event timeline
//
// Everything mutation-y is a small focused sub-form so an admin can edit
// one thing without touching the rest. The event timeline is populated
// by every server action — making corrections traceable is the whole
// point of /admin/orders.
// ─────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  ChevronLeft,
  ExternalLink,
  FileText,
  Mail,
  User2,
} from "lucide-react";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { getAdminOrder } from "@/lib/queries/admin-orders";
import { canTransition } from "@/lib/orders/transitions";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/orders/labels";
import { StatusActions } from "@/components/admin/orders/status-actions";
import { TrackingForm } from "@/components/admin/orders/tracking-form";
import { RefundForm } from "@/components/admin/orders/refund-form";
import { NotesForm } from "@/components/admin/orders/notes-form";
import { SendcloudRetryButton } from "@/components/admin/orders/sendcloud-retry-button";
import { InvoiceForm } from "@/components/admin/orders/invoice-form";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const order = await getAdminOrder(id);
  if (!order) notFound();

  const currency = order.currency;
  // Accept number | string | Prisma.Decimal — Prisma returns Decimal for all
  // money fields. `Number(new Prisma.Decimal("24.90"))` → 24.9, which is what
  // we want for display.
  const euro = (n: number | string | { toString(): string }) =>
    formatMoney(Number(n.toString()), currency);

  // Compute which status transitions are legal right now. Client component
  // will render only the buttons we list here.
  const statusOptions = (
    ["PAID", "FULFILLING", "SHIPPED", "DELIVERED", "CANCELLED"] as OrderStatus[]
  )
    .filter((t) => canTransition(order.status, t))
    .map((value) => ({
      value,
      label: `Move to ${ORDER_STATUS_LABELS[value]}`,
      variant:
        value === "CANCELLED"
          ? ("danger" as const)
          : value === "SHIPPED" || value === "DELIVERED"
            ? ("primary" as const)
            : ("secondary" as const),
    }));

  const customerName =
    order.user &&
    [order.user.firstName, order.user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      {/* masthead */}
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        All orders
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Order</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            {order.publicNumber}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-mid">
            <span>{formatDateTime(order.placedAt)}</span>
            <span aria-hidden>·</span>
            <StatusBadge status={order.status} />
            <span aria-hidden>·</span>
            <PaymentBadge status={order.paymentStatus} />
            {!order.userId && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-label bg-ink/5 text-ink-mid">
                  Guest checkout
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr]">
        {/* ─────────────────── LEFT ─────────────────── */}
        <div className="space-y-10">
          {/* line items */}
          <Panel title="Line items" count={order.items.length}>
            <ul className="divide-y divide-ink/10">
              {order.items.map((it) => {
                const name =
                  it.product?.translations[0]?.name ??
                  it.nameSnapshot ??
                  "Item";
                const thumb = it.product?.media[0]?.url;
                const slug = it.product?.translations[0]?.slug;
                const line = Number(it.lineTotal);
                return (
                  <li key={it.id} className="flex items-start gap-4 py-4">
                    <div className="relative h-16 w-16 flex-shrink-0 border border-ink/10 bg-rice">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          {slug ? (
                            <Link
                              href={`/en/shop/${slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block font-display text-[15px] text-ink hover:underline"
                            >
                              {name}{" "}
                              <ExternalLink className="inline-block h-3 w-3 align-baseline text-ink-mid" />
                            </Link>
                          ) : (
                            <div className="font-display text-[15px] text-ink">
                              {name}
                            </div>
                          )}
                          <div className="mt-0.5 text-[11px] text-ink-mid">
                            SKU{" "}
                            <span className="font-mono">
                              {it.skuSnapshot ??
                                it.variant?.sku ??
                                it.product?.sku ??
                                "—"}
                            </span>
                            {it.variant?.label && (
                              <> {" · "} {it.variant.label}</>
                            )}
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="text-[13px] text-ink">
                            {euro(line)}
                          </div>
                          <div className="text-[11px] text-ink-mid">
                            {it.quantity} × {euro(it.unitPrice)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* totals */}
            <dl className="mt-4 space-y-1 border-t border-ink/10 pt-4 text-[13px]">
              <TotalRow label="Subtotal" value={euro(order.subtotal)} />
              {Number(order.discountTotal) !== 0 && (
                <TotalRow
                  label={order.couponCode ? `Discount (${order.couponCode})` : "Discount"}
                  value={`- ${euro(order.discountTotal)}`}
                />
              )}
              <TotalRow
                label="Shipping"
                value={
                  Number(order.shippingTotal) === 0
                    ? "Free"
                    : euro(order.shippingTotal)
                }
              />
              {Number(order.taxTotal) !== 0 && (
                <TotalRow label="Tax" value={euro(order.taxTotal)} />
              )}
              <TotalRow
                label="Grand total"
                value={euro(order.grandTotal)}
                bold
              />
            </dl>
          </Panel>

          {/* addresses */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <AddressPanel title="Shipping to" address={order.shippingAddress} />
            <AddressPanel title="Billing to" address={order.billingAddress} />
          </div>

          {/* customer + payment refs */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Panel title="Customer">
              <dl className="space-y-1.5 text-[13px]">
                <InfoRow
                  icon={<User2 className="h-3.5 w-3.5" />}
                  label="Name"
                  value={customerName || "—"}
                />
                <InfoRow
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Email"
                  value={
                    <a
                      href={`mailto:${order.email}`}
                      className="text-ink hover:underline"
                    >
                      {order.email}
                    </a>
                  }
                />
                {order.user?.phone && (
                  <InfoRow label="Phone" value={order.user.phone} />
                )}
                {order.user && (
                  <InfoRow
                    label="Since"
                    value={formatDate(order.user.createdAt)}
                  />
                )}
                {order.notes && (
                  <div className="mt-3 border-t border-ink/10 pt-3">
                    <div className="text-[11px] uppercase tracking-label text-ink-mid">
                      Customer note
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[12px] text-ink">
                      {order.notes}
                    </p>
                  </div>
                )}
              </dl>
            </Panel>

            <Panel title="References">
              <dl className="space-y-1.5 text-[13px]">
                <InfoRow
                  label="Mollie id"
                  value={
                    order.mollieId ? (
                      <span className="font-mono text-[12px]">
                        {order.mollieId}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
                {order.molliePaymentUrl && (
                  <InfoRow
                    label="Pay link"
                    value={
                      <a
                        href={order.molliePaymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-ink hover:underline"
                      >
                        Open <ArrowUpRight className="h-3 w-3" />
                      </a>
                    }
                  />
                )}
                <InfoRow
                  label="Sendcloud parcel"
                  value={
                    order.sendcloudParcelId ? (
                      <span className="font-mono text-[12px]">
                        {order.sendcloudParcelId}
                      </span>
                    ) : order.status === "PAID" ||
                      order.status === "FULFILLING" ? (
                      // Auto-sync didn't land — surface a manual retry
                      // button so an admin can re-fire without leaving the page.
                      <SendcloudRetryButton orderId={order.id} />
                    ) : (
                      "—"
                    )
                  }
                />
                <InfoRow
                  label="Tracking #"
                  value={
                    order.trackingNumber ? (
                      <span className="font-mono text-[12px]">
                        {order.trackingNumber}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
                {order.trackingUrl && (
                  <InfoRow
                    label="Tracking URL"
                    value={
                      <a
                        href={order.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-ink hover:underline"
                      >
                        Open <ArrowUpRight className="h-3 w-3" />
                      </a>
                    }
                  />
                )}
                {order.invoiceUrl && (
                  <InfoRow
                    label="Invoice"
                    value={
                      <a
                        href={order.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-ink hover:underline"
                      >
                        <FileText className="h-3 w-3" /> PDF
                      </a>
                    }
                  />
                )}
                <InfoRow label="Currency" value={order.currency} />
                <InfoRow label="Locale" value={order.locale} />
              </dl>
            </Panel>
          </div>

          {/* event timeline */}
          <Panel title="Activity" count={order.events.length}>
            {order.events.length === 0 ? (
              <p className="text-[12px] text-ink-mid">No activity yet.</p>
            ) : (
              <ol className="space-y-3">
                {order.events.map((ev) => (
                  <li key={ev.id} className="flex items-start gap-3">
                    <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ink" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-ink">
                        <span className="uppercase tracking-label text-[10px] text-ink-mid">
                          {ev.kind}
                        </span>
                        {ev.message && (
                          <span className="ml-2 text-ink">· {ev.message}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-mid">
                        {formatDateTime(ev.createdAt)}
                        {ev.metadata && hasActor(ev.metadata) && (
                          <> · {actorOf(ev.metadata)}</>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        {/* ─────────────────── RIGHT ─────────────────── */}
        <aside className="space-y-8">
          <Panel title="Status">
            <StatusActions orderId={order.id} options={statusOptions} />
          </Panel>

          {/* Shipping panel hidden for digital-only orders — no parcel
              to track, and the markShipped action would refuse anyway. */}
          {order.items.some((it) => it.product.kind !== "GIFT_CARD") ? (
            <Panel title="Shipping">
              <TrackingForm
                orderId={order.id}
                trackingNumber={order.trackingNumber}
                trackingUrl={order.trackingUrl}
                alreadyShipped={
                  order.status === "SHIPPED" || order.status === "DELIVERED"
                }
              />
            </Panel>
          ) : (
            <Panel title="Delivery">
              <p className="text-[12px] leading-relaxed text-ink-mid">
                Digital order — gift card code(s) delivered by email at
                payment confirmation. No parcel to ship.
              </p>
            </Panel>
          )}

          <Panel title="Refund">
            <RefundForm
              orderId={order.id}
              grandTotal={Number(order.grandTotal)}
              currency={order.currency}
            />
          </Panel>

          <Panel title="Admin notes">
            <NotesForm orderId={order.id} defaultValue={order.adminNotes} />
          </Panel>

          <Panel title="Invoice URL">
            <InvoiceForm
              orderId={order.id}
              defaultValue={order.invoiceUrl}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

// ──────── small building blocks ────────────────────────────────────────

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-ink/10 bg-white/60">
      <header className="flex items-center justify-between border-b border-ink/10 px-5 py-3">
        <h2 className="text-[11px] uppercase tracking-label text-ink-mid">
          {title}
        </h2>
        {typeof count === "number" && (
          <span className="text-[11px] uppercase tracking-label text-ink-mid">
            {count}
          </span>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TotalRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4",
        bold ? "mt-2 border-t border-ink/10 pt-2 text-ink font-medium" : "text-ink-mid",
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-mid">
        {icon}
        {label}
      </dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}

type AddressShape = {
  firstName: string;
  lastName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  postcode: string;
  city: string;
  region: string | null;
  country: string;
  phone: string | null;
} | null;

function AddressPanel({
  title,
  address,
}: {
  title: string;
  address: AddressShape;
}) {
  return (
    <Panel title={title}>
      {address ? (
        <address className="not-italic text-[13px] leading-relaxed text-ink">
          <div>
            {[address.firstName, address.lastName].filter(Boolean).join(" ")}
          </div>
          {address.company && <div>{address.company}</div>}
          <div>{address.line1}</div>
          {address.line2 && <div>{address.line2}</div>}
          <div>
            {address.postcode} {address.city}
            {address.region ? `, ${address.region}` : ""}
          </div>
          <div className="uppercase tracking-label text-[11px] text-ink-mid">
            {address.country}
          </div>
          {address.phone && (
            <div className="mt-1 text-[12px] text-ink-mid">
              {address.phone}
            </div>
          )}
        </address>
      ) : (
        <p className="text-[12px] text-ink-mid">No address on file.</p>
      )}
    </Panel>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className="inline-flex items-center border border-ink/15 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink">
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className="inline-flex items-center border border-ink/15 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
      Pay: {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

// ──────── formatters ───────────────────────────────────────────────────

function formatMoney(n: number, currency: string) {
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

function formatDateTime(d: Date) {
  return `${formatDate(d)} · ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Defensive helpers for OrderEvent.metadata which is JSON. */
function hasActor(meta: unknown): meta is { actor?: string | null } {
  return !!meta && typeof meta === "object" && "actor" in meta;
}
function actorOf(meta: unknown): string {
  if (hasActor(meta) && typeof meta.actor === "string") return meta.actor;
  return "admin";
}
