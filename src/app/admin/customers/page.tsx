// ─────────────────────────────────────────────────────────────────────────
// /admin/customers — list of people who have an account or are opted-in.
//
// URL-driven filters:
//   ?q=…                — email / name / phone search
//   ?role=ADMIN         — by role
//   ?segment=customers  — has placed >= 1 order
//   ?segment=newsletter — opted-in, never ordered
//   ?deleted=1          — show soft-deleted rows
//   ?sort=spend|orders|name|recent (default: recent)
//   ?page, ?size
//
// The row shows email, name, role, locale, signup date, lifetime orders
// and spend. Click-through opens the detail page.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Download, Search } from "lucide-react";
import { Role } from "@prisma/client";
import {
  adminCustomerCounts,
  listAdminCustomers,
} from "@/lib/queries/admin-customers";
import { cn } from "@/lib/utils";
import { requireCapability } from "@/lib/auth-roles";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  role?: string;
  segment?: string;
  deleted?: string;
  sort?: string;
  page?: string;
  size?: string;
}>;

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Editors have no business in the customer list (PII, marketing opt-in
  // data). Fulfilment staff do, so they can see shipping addresses.
  // Owner-only export is gated separately in the route handler.
  await requireCapability("customers.view");

  const sp = await searchParams;

  const role = isRole(sp.role) ? sp.role : undefined;
  const segment = isSegment(sp.segment) ? sp.segment : "all";
  const includeDeleted = sp.deleted === "1";
  const sort = isSort(sp.sort) ? sp.sort : "recent";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = clampSize(Number(sp.size));

  const [result, counts] = await Promise.all([
    listAdminCustomers({
      q: sp.q,
      role,
      segment,
      includeDeleted,
      sort,
      page,
      pageSize,
    }),
    adminCustomerCounts(),
  ]);

  const hasFilters =
    Boolean(sp.q) ||
    Boolean(role) ||
    Boolean(sp.segment) ||
    includeDeleted ||
    (sort !== "recent");

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      {/* masthead */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">People</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            Customers
          </h1>
          <p className="mt-2 text-[13px] text-ink-mid">
            {counts.total} active accounts · {counts.byRole.ADMIN} admin ·{" "}
            {counts.newsletter} newsletter-only
          </p>
        </div>
        <a
          href={buildExportHref(sp)}
          className="inline-flex items-center gap-2 border border-ink/20 bg-white px-4 py-2 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </a>
      </header>

      {/* filter form (URL-driven) */}
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
            placeholder="Search by email, name, phone…"
            className="w-full border border-ink/15 bg-white py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
          />
        </div>

        <select
          name="role"
          defaultValue={role ?? ""}
          className="border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
        >
          <option value="">Any role</option>
          {Object.values(Role).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          name="sort"
          defaultValue={sort}
          className="border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
        >
          <option value="recent">Recent signup</option>
          <option value="spend">Top spenders</option>
          <option value="orders">Most orders</option>
          <option value="name">Name A–Z</option>
        </select>

        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-mid">
            <input
              type="checkbox"
              name="deleted"
              value="1"
              defaultChecked={includeDeleted}
              className="h-3.5 w-3.5 accent-ink"
            />
            Deleted
          </label>
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
                href="/admin/customers"
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

      {/* segment pills */}
      <div className="mt-6 flex flex-wrap gap-1 text-[11px] uppercase tracking-label">
        <SegmentPill
          label={`All · ${counts.total}`}
          href={buildFilterHref(sp, { segment: null })}
          active={segment === "all"}
        />
        <SegmentPill
          label={`Paying customers`}
          href={buildFilterHref(sp, { segment: "customers" })}
          active={segment === "customers"}
        />
        <SegmentPill
          label={`Newsletter · ${counts.newsletter}`}
          href={buildFilterHref(sp, { segment: "newsletter" })}
          active={segment === "newsletter"}
        />
        {counts.deleted > 0 && (
          <SegmentPill
            label={`Deleted · ${counts.deleted}`}
            href={buildFilterHref(sp, { deleted: includeDeleted ? null : "1" })}
            active={includeDeleted}
          />
        )}
      </div>

      {/* table */}
      <div className="mt-6 border border-ink/10 bg-white/60">
        {result.rows.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
                <Th className="w-[28%]">Customer</Th>
                <Th>Role</Th>
                <Th>Locale</Th>
                <Th>Marketing</Th>
                <Th className="text-right">Orders</Th>
                <Th className="text-right">Spent</Th>
                <Th>Last order</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((c) => {
                const fullName = [c.firstName, c.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim();
                // Subscribers have no customer detail page (no account).
                // We render them non-clickable but visually in-family.
                const isSubscriber = c.kind === "subscriber";
                return (
                  <tr
                    key={`${c.kind}:${c.id}`}
                    className={cn(
                      "border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]",
                      c.deletedAt && "opacity-60",
                    )}
                  >
                    <Td>
                      {isSubscriber ? (
                        <div className="block text-ink">
                          <div className="font-display text-[14px]">
                            {c.email}
                          </div>
                          {c.source && (
                            <div className="text-[11px] text-ink-mid">
                              from {c.source}
                            </div>
                          )}
                          {c.deletedAt && (
                            <div className="mt-0.5 inline-block bg-vermilion/10 px-1.5 py-0.5 text-[9px] uppercase tracking-label text-vermilion">
                              Unsubscribed
                            </div>
                          )}
                        </div>
                      ) : (
                        <Link
                          href={`/admin/customers/${c.id}`}
                          className="block text-ink hover:underline"
                        >
                          <div className="font-display text-[14px]">
                            {fullName || c.email}
                          </div>
                          {fullName && (
                            <div className="text-[11px] text-ink-mid">
                              {c.email}
                            </div>
                          )}
                          {c.deletedAt && (
                            <div className="mt-0.5 inline-block bg-vermilion/10 px-1.5 py-0.5 text-[9px] uppercase tracking-label text-vermilion">
                              Deleted
                            </div>
                          )}
                        </Link>
                      )}
                    </Td>
                    <Td>
                      {c.role ? (
                        <RoleBadge role={c.role} />
                      ) : (
                        <SubscriberBadge />
                      )}
                    </Td>
                    <Td className="text-[12px] uppercase tracking-label text-ink-mid">
                      {c.preferredLocale}
                    </Td>
                    <Td>
                      {isSubscriber ? (
                        <SubscriberStatus status={c.subscriberStatus} />
                      ) : c.marketingOptIn ? (
                        <span className="text-sage">Opted in</span>
                      ) : (
                        <span className="text-ink-mid">—</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {isSubscriber ? (
                        <span className="text-ink-mid">—</span>
                      ) : (
                        c.orderCount
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {isSubscriber ? (
                        <span className="text-ink-mid">—</span>
                      ) : (
                        formatMoney(c.totalSpent)
                      )}
                    </Td>
                    <Td className="text-ink-mid">
                      {c.lastOrderAt ? formatDate(c.lastOrderAt) : "—"}
                    </Td>
                    <Td className="text-ink-mid">{formatDate(c.createdAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* pagination */}
      {result.totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-6 flex items-center justify-between text-[12px] text-ink-mid"
        >
          <div>
            Page {result.page} of {result.totalPages} · {result.total} customers
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

// ──────── helpers ──────────────────────────────────────────────────────

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (Object.values(Role) as string[]).includes(v);
}
function isSegment(v: unknown): v is "all" | "customers" | "newsletter" {
  return v === "all" || v === "customers" || v === "newsletter";
}
function isSort(v: unknown): v is "recent" | "spend" | "orders" | "name" {
  return v === "recent" || v === "spend" || v === "orders" || v === "name";
}
function clampSize(n: number) {
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(200, Math.max(10, Math.floor(n)));
}
function formatMoney(n: number) {
  return `€ ${n.toFixed(2)}`;
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
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") params.delete(k);
    else params.set(k, v);
  }
  if (!("page" in patch)) params.delete("page");
  const qs = params.toString();
  return qs ? `/admin/customers?${qs}` : "/admin/customers";
}

function buildExportHref(sp: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "page" && k !== "size") params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/admin/customers/export?${qs}` : "/admin/customers/export";
}

function SegmentPill({
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

function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, string> = {
    CUSTOMER: "bg-ink/5 text-ink-mid",
    STAFF: "bg-sage/15 text-sage",
    ADMIN: "bg-ink text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-label",
        map[role],
      )}
    >
      {role}
    </span>
  );
}

/** Shown in the role column for anonymous newsletter-only rows. */
function SubscriberBadge() {
  return (
    <span className="inline-flex items-center bg-bone px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-soft">
      Newsletter
    </span>
  );
}

/** Double-opt-in status pill for subscriber rows. */
function SubscriberStatus({
  status,
}: {
  status: "confirmed" | "pending" | "unsubscribed" | null;
}) {
  if (status === "confirmed") {
    return <span className="text-sage">Confirmed</span>;
  }
  if (status === "pending") {
    return <span className="text-ink-mid">Pending</span>;
  }
  if (status === "unsubscribed") {
    return <span className="text-vermilion">Unsubscribed</span>;
  }
  return <span className="text-ink-mid">—</span>;
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="font-display text-[22px] text-ink">
        {hasFilters ? "No matches" : "No customers yet"}
      </div>
      <p className="mt-2 max-w-sm text-[13px] text-ink-mid">
        {hasFilters
          ? "Try relaxing your filters."
          : "Sign-ups and newsletter subscribers will appear here."}
      </p>
    </div>
  );
}
