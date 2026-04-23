// ─────────────────────────────────────────────────────────────────────────
// /admin/coupons — list view.
//
// Calm table, newest/active first. Each row is clickable (row-level link)
// and has a quick "toggle active" form to disable a code without opening
// the edit page.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Plus, BadgePercent } from "lucide-react";
import { listAdminCoupons } from "@/lib/queries/admin-coupons";
import { toggleCouponActiveAction } from "./actions";
import { formatDiscount, formatMinSubtotal, formatWindow } from "./format";
import { requireCapability } from "@/lib/auth-roles";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  // Coupons are money-coded: free-shipping + percent-off codes can be
  // minted by anyone with access. Owner-only.
  await requireCapability("coupons.edit");

  const { rows, total } = await listAdminCoupons();

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Coupons</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            Discount codes
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            Percent off, fixed amount, or free shipping — with optional
            redemption caps and date windows. {total} total.
          </p>
        </div>
        <Link
          href="/admin/coupons/new"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New coupon
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="border border-ink/10 bg-white/60">
          <table className="w-full text-[13px]">
            <thead className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Min. subtotal</th>
                <th className="px-4 py-3">Window</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3 text-right">Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const usage = c.maxRedemptions
                  ? `${c.redemptionsUsed} / ${c.maxRedemptions}`
                  : `${c.redemptionsUsed}`;
                return (
                  <tr
                    key={c.code}
                    className="border-b border-ink/5 last:border-b-0 hover:bg-ink/2"
                  >
                    <td className="px-4 py-3 align-middle">
                      <Link
                        href={`/admin/coupons/${encodeURIComponent(c.code)}`}
                        className="flex items-center gap-2 font-mono text-[13px] text-ink underline-offset-4 hover:underline"
                      >
                        <BadgePercent className="h-3.5 w-3.5 text-ink-mid" />
                        {c.code}
                        {c.firstOrderOnly && (
                          <span className="text-[10px] uppercase tracking-label text-ink-mid">
                            · first-order
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-middle text-ink">
                      {formatDiscount(c)}
                    </td>
                    <td className="px-4 py-3 align-middle text-ink-mid">
                      {formatMinSubtotal(c.minSubtotalCents)}
                    </td>
                    <td className="px-4 py-3 align-middle text-ink-mid">
                      {formatWindow(c.startsAt, c.endsAt)}
                    </td>
                    <td className="px-4 py-3 align-middle text-ink-mid">
                      {usage}
                    </td>
                    <td className="px-4 py-3 align-middle text-right">
                      <form action={toggleCouponActiveAction}>
                        <input type="hidden" name="code" value={c.code} />
                        <input
                          type="hidden"
                          name="nextActive"
                          value={(!c.isActive).toString()}
                        />
                        <button
                          type="submit"
                          className={
                            c.isActive
                              ? "text-[11px] uppercase tracking-label text-sage hover:text-sage/80"
                              : "text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
                          }
                          aria-label={c.isActive ? "Deactivate" : "Activate"}
                        >
                          {c.isActive ? "Active" : "Inactive"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
      <BadgePercent className="mx-auto h-6 w-6 text-ink-mid" />
      <h2 className="mt-4 font-display text-[22px] text-ink">No coupons yet</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
        Create one-off codes (WELCOME10), seasonal campaigns (SPRING),
        or free-shipping promos. Customers enter the code at checkout.
      </p>
      <Link
        href="/admin/coupons/new"
        className="mt-6 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
      >
        <Plus className="h-3.5 w-3.5" />
        Create the first coupon
      </Link>
    </div>
  );
}
