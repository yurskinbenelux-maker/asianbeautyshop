// ─────────────────────────────────────────────────────────────────────────
// /admin/returns — list of every return request, newest first.
//
// Filter by status via ?status=PENDING  (URL-driven so it's bookmarkable).
// Keep the table skinny — full detail lives on the per-return page.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { listReturnsForAdmin } from "@/lib/returns/db";
import { RETURN_STATUS, type ReturnStatus } from "@/lib/returns/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<ReturnStatus, string> = {
  REQUESTED: "bg-ink/5 text-ink",
  APPROVED: "bg-gold/10 text-gold",
  RECEIVED: "bg-gold/15 text-gold",
  REFUNDED: "bg-vermilion/10 text-vermilion",
  REJECTED: "bg-ink/5 text-ink-mid line-through",
  CANCELLED: "bg-ink/5 text-ink-mid",
};

type SearchParams = Promise<{ status?: string; page?: string }>;

function isReturnStatus(v: unknown): v is ReturnStatus {
  return typeof v === "string" && (RETURN_STATUS as readonly string[]).includes(v);
}

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = isReturnStatus(sp.status) ? sp.status : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const { rows, total } = await listReturnsForAdmin({
    status,
    limit: pageSize,
    offset,
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Commerce</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            Returns
          </h1>
          <p className="mt-2 text-[13px] text-ink-mid">
            {total} total {status ? `· filtered by ${status.toLowerCase()}` : ""}
          </p>
        </div>
      </header>

      {/* status pills */}
      <div className="mt-8 flex flex-wrap gap-1 text-[11px] uppercase tracking-label">
        <Pill href="/admin/returns" active={!status} label={`All · ${total}`} />
        {RETURN_STATUS.map((s) => (
          <Pill
            key={s}
            href={`/admin/returns?status=${s}`}
            active={status === s}
            label={s.toLowerCase()}
          />
        ))}
      </div>

      <div className="mt-6 border border-ink/10 bg-white/60">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="font-display text-[22px] text-ink">
              No returns {status ? "in this status" : "yet"}
            </div>
            <p className="mt-2 max-w-sm text-[13px] text-ink-mid">
              Customers submit returns from their account. When one comes in,
              it&rsquo;ll appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
                <th className="px-4 py-3 font-normal">Return</th>
                <th className="px-4 py-3 font-normal">Order</th>
                <th className="px-4 py-3 font-normal">Customer</th>
                <th className="px-4 py-3 font-normal">Items</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Requested</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const itemCount = r.items.reduce((n, i) => n + i.quantity, 0);
                const customer =
                  [r.customerFirstName, r.customerLastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || r.orderEmail;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/returns/${r.id}`}
                        className="font-mono text-[12px] text-ink hover:underline"
                      >
                        {r.publicNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders`}
                        className="text-ink hover:underline"
                      >
                        {r.orderPublicNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{customer}</td>
                    <td className="px-4 py-3 text-ink-mid">
                      {itemCount} {itemCount === 1 ? "item" : "items"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-label",
                          STATUS_TONE[r.status],
                        )}
                      >
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-mid">
                      {r.createdAt.toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-[12px] text-ink-mid">
          <div>
            Page {page} of {totalPages} · {total} returns
          </div>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={`/admin/returns?${status ? `status=${status}&` : ""}page=${page - 1}`}
                className="border border-ink/15 px-3 py-1.5 uppercase tracking-label hover:border-ink hover:text-ink"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/returns?${status ? `status=${status}&` : ""}page=${page + 1}`}
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

function Pill({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
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
