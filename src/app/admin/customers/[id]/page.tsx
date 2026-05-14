// ─────────────────────────────────────────────────────────────────────────
// /admin/customers/[id] — single customer dossier.
//
// Two-column layout:
//   LEFT — stats + orders + addresses + wishlist
//   RIGHT — profile form, role selector, password-reset, danger zone
//
// Everything mutation-y lives on the right rail in its own sub-form so
// an admin can fix one thing without touching the others.
// ─────────────────────────────────────────────────────────────────────────

import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  CalendarClock,
  ChevronLeft,
  Coins,
  ExternalLink,
  Mail,
  Package,
  Phone,
} from "lucide-react";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { getAdminCustomer } from "@/lib/queries/admin-customers";
import { requireAdmin } from "@/lib/auth";
import { ProfileForm } from "@/components/admin/customers/profile-form";
import { RoleForm } from "@/components/admin/customers/role-form";
import { ResetForm } from "@/components/admin/customers/reset-form";
import { DangerZone } from "@/components/admin/customers/danger-zone";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/orders/labels";
import { cn } from "@/lib/utils";
import { formatAdminDate } from "@/lib/utils/format-date";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const actor = await requireAdmin();
  const result = await getAdminCustomer(id);
  if (!result) notFound();

  const { user, stats } = result;
  const isSelf = Boolean(
    actor.email && user.email.toLowerCase() === actor.email.toLowerCase(),
  );
  const isDeleted = Boolean(user.deletedAt);

  const fullName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
        All customers
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Customer</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            {fullName || user.email}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-ink-mid">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              <a href={`mailto:${user.email}`} className="hover:text-ink">
                {user.email}
              </a>
            </span>
            {user.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {user.phone}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Joined {formatDate(user.createdAt)}
            </span>
            <span className="inline-flex items-center border border-ink/15 px-2 py-0.5 text-[10px] uppercase tracking-label">
              {user.role}
            </span>
            {isSelf && (
              <span className="inline-flex items-center bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-label text-gold">
                You
              </span>
            )}
            {isDeleted && (
              <span className="inline-flex items-center bg-vermilion/10 px-2 py-0.5 text-[10px] uppercase tracking-label text-vermilion">
                Deleted
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr]">
        {/* ───────────────── LEFT ───────────────── */}
        <div className="space-y-10">
          {/* stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Paid orders"
              value={String(stats.paidOrderCount)}
              icon={<Package className="h-4 w-4" />}
            />
            <StatCard
              label="Lifetime spend"
              value={formatMoney(stats.totalSpent)}
              icon={<Coins className="h-4 w-4" />}
            />
            <StatCard
              label="Avg order"
              value={
                stats.paidOrderCount === 0
                  ? "—"
                  : formatMoney(stats.totalSpent / stats.paidOrderCount)
              }
            />
            <StatCard
              label="Last order"
              value={stats.lastOrderAt ? formatDate(stats.lastOrderAt) : "—"}
            />
          </div>

          {/* orders */}
          <Panel title="Orders" count={user.orders.length}>
            {user.orders.length === 0 ? (
              <p className="text-[12px] text-ink-mid">
                No orders yet.
              </p>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
                    <th className="px-2 py-2 font-normal">Order</th>
                    <th className="px-2 py-2 font-normal">Status</th>
                    <th className="px-2 py-2 font-normal">Payment</th>
                    <th className="px-2 py-2 font-normal text-right">Total</th>
                    <th className="px-2 py-2 font-normal">Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {user.orders.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]"
                    >
                      <td className="px-2 py-2">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-mono text-[12px] text-ink hover:underline"
                        >
                          {o.publicNumber}
                        </Link>
                        <span className="ml-2 text-[11px] text-ink-mid">
                          {o.items.reduce((n, i) => n + i.quantity, 0)} items
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <InlineBadge
                          label={ORDER_STATUS_LABELS[o.status as OrderStatus]}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <InlineBadge
                          label={
                            PAYMENT_STATUS_LABELS[
                              o.paymentStatus as PaymentStatus
                            ]
                          }
                          muted
                        />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatMoney(Number(o.grandTotal), o.currency)}
                      </td>
                      <td className="px-2 py-2 text-ink-mid">
                        {formatDate(o.placedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Panel>

          {/* addresses */}
          <Panel title="Saved addresses" count={user.addresses.length}>
            {user.addresses.length === 0 ? (
              <p className="text-[12px] text-ink-mid">
                No saved addresses.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {user.addresses.map((a) => (
                  <li
                    key={a.id}
                    className="border border-ink/10 bg-white p-4 text-[13px] text-ink"
                  >
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-label text-ink-mid">
                      <span>{a.type}</span>
                      {a.isDefault && (
                        <span className="bg-gold/15 px-1.5 py-0.5 text-gold">
                          Default
                        </span>
                      )}
                    </div>
                    <address className="mt-2 not-italic leading-relaxed">
                      <div>
                        {[a.firstName, a.lastName].filter(Boolean).join(" ")}
                      </div>
                      {a.company && <div>{a.company}</div>}
                      <div>{a.line1}</div>
                      {a.line2 && <div>{a.line2}</div>}
                      <div>
                        {a.postcode} {a.city}
                        {a.region ? `, ${a.region}` : ""}
                      </div>
                      <div className="uppercase tracking-label text-[11px] text-ink-mid">
                        {a.country}
                      </div>
                      {a.phone && (
                        <div className="mt-1 text-[12px] text-ink-mid">
                          {a.phone}
                        </div>
                      )}
                    </address>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* wishlist */}
          <Panel title="Wishlist" count={user.wishlist.length}>
            {user.wishlist.length === 0 ? (
              <p className="text-[12px] text-ink-mid">
                Wishlist is empty.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {user.wishlist.map((w) => {
                  const p = w.product;
                  const name = p.translations[0]?.name ?? "Product";
                  const slug = p.translations[0]?.slug;
                  const img = p.media[0]?.url;
                  return (
                    <li
                      key={w.id}
                      className="flex items-center gap-3 border border-ink/10 bg-white p-3"
                    >
                      <div className="relative h-12 w-12 flex-shrink-0 border border-ink/10 bg-rice">
                        {img && (
                          <Image
                            src={img}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-ink">
                          {name}
                        </div>
                        <div className="text-[11px] text-ink-mid">
                          € {Number(p.price).toFixed(2)}
                        </div>
                      </div>
                      {slug && (
                        <Link
                          href={`/en/shop/${slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* ───────────────── RIGHT ───────────────── */}
        <aside className="space-y-8">
          <Panel title="Profile">
            <ProfileForm
              userId={user.id}
              firstName={user.firstName}
              lastName={user.lastName}
              phone={user.phone}
              preferredLocale={user.preferredLocale}
              marketingOptIn={user.marketingOptIn}
            />
          </Panel>

          <Panel title="Role">
            <RoleForm
              userId={user.id}
              currentRole={user.role}
              selfEditLocked={isSelf}
            />
          </Panel>

          <Panel title="Password">
            <ResetForm userId={user.id} />
            <p className="mt-3 text-[11px] text-ink-mid">
              Sends a Supabase-hosted password reset email to{" "}
              <span className="font-mono">{user.email}</span>.
            </p>
          </Panel>

          <Panel title="Danger zone" tone="danger">
            <DangerZone
              userId={user.id}
              isDeleted={isDeleted}
              isSelf={isSelf}
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
  tone,
  children,
}: {
  title: string;
  count?: number;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "border bg-white/60",
        tone === "danger" ? "border-vermilion/20" : "border-ink/10",
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between border-b px-5 py-3",
          tone === "danger" ? "border-vermilion/20" : "border-ink/10",
        )}
      >
        <h2
          className={cn(
            "text-[11px] uppercase tracking-label",
            tone === "danger" ? "text-vermilion" : "text-ink-mid",
          )}
        >
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

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border border-ink/10 bg-white p-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-label text-ink-mid">
        <span>{label}</span>
        {icon && <span className="text-ink-mid/70">{icon}</span>}
      </div>
      <div className="mt-2 font-display text-[22px] text-ink">{value}</div>
    </div>
  );
}

function InlineBadge({
  label,
  muted,
}: {
  label: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-label",
        muted ? "bg-ink/5 text-ink-mid" : "bg-ink/10 text-ink",
      )}
    >
      {label}
    </span>
  );
}

function formatMoney(n: number, currency = "EUR") {
  const symbol = currency === "EUR" ? "€" : currency;
  return `${symbol} ${n.toFixed(2)}`;
}
function formatDate(d: Date) {
  return formatAdminDate(d);
}
