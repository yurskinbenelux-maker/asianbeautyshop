// ─────────────────────────────────────────────────────────────────────────
// /admin/gift-cards — list view, filter + search.
//
// Owner sees everything; Fulfilment gets a read-only view (capability
// `giftcards.view`). Status filter pills + a free-text query that hits
// code / recipient / sender. Pagination as on every other admin list.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { GiftCardStatus } from "@prisma/client";
import { requireCapability } from "@/lib/auth-roles";
import { listGiftCards } from "@/lib/queries/gift-cards";
import { hasCapability } from "@/lib/auth-roles-shared";

type Props = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
  }>;
};

export default async function AdminGiftCardsPage({ searchParams }: Props) {
  const { role } = await requireCapability(
    "giftcards.view",
    "/admin/gift-cards",
  );
  const sp = await searchParams;

  const statusParam = (sp.status?.toUpperCase() ?? "ALL") as
    | GiftCardStatus
    | "ALL";
  const validStatuses: Array<GiftCardStatus | "ALL"> = [
    "ALL",
    "ACTIVE",
    "DEPLETED",
    "EXPIRED",
    "VOID",
  ];
  const status = validStatuses.includes(statusParam) ? statusParam : "ALL";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total, perPage } = await listGiftCards({
    status,
    query: sp.q,
    page,
    perPage: 25,
  });
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const canManage = hasCapability(role, "giftcards.manage");

  return (
    <div className="px-8 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-label text-ink-mid">
            Platform
          </div>
          <h1 className="mt-2 font-display text-[28px] leading-tight text-ink">
            Gift cards
          </h1>
          <p className="mt-2 text-[13px] text-ink-mid">
            Every card the shop has ever minted. {total} total.
          </p>
        </div>
      </header>

      {/* ── filter bar ────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-2 border-y border-ink/10 py-4">
        {validStatuses.map((s) => {
          const active = s === status;
          const href =
            s === "ALL"
              ? "/admin/gift-cards"
              : `/admin/gift-cards?status=${s}`;
          return (
            <Link
              key={s}
              href={href}
              className={
                active
                  ? "border border-ink bg-ink px-3 py-1.5 text-[11px] uppercase tracking-label text-rice"
                  : "border border-ink/20 px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink/40 hover:text-ink"
              }
            >
              {s.toLowerCase()}
            </Link>
          );
        })}
        <form className="ml-auto" action="/admin/gift-cards" method="get">
          {status !== "ALL" && (
            <input type="hidden" name="status" value={status} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search code, email…"
            className="w-64 border border-ink/20 bg-white px-3 py-1.5 text-[12px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
          />
        </form>
      </div>

      {/* ── table ─────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="border border-dashed border-ink/15 bg-white/40 p-12 text-center text-[13px] text-ink-mid">
          No gift cards match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto border border-ink/10">
          <table className="w-full text-[13px]">
            <thead className="border-b border-ink/10 bg-rice-dim/50">
              <tr className="text-left text-[11px] uppercase tracking-label text-ink-mid">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3 text-right">Initial</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Issued</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-ink/5 hover:bg-rice-dim/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/gift-cards/${c.id}`}
                      className="font-mono text-ink hover:text-vermilion"
                    >
                      {c.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    <div>{c.recipientName ?? "—"}</div>
                    <div className="text-[11px] text-ink-mid">
                      {c.recipientEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {c.senderEmail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[11px] uppercase tracking-label text-ink-mid">
                    {c.deliveryMode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-ink">
                    {formatEur(c.initialBalanceEur)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        c.balanceEur < c.initialBalanceEur
                          ? "text-vermilion"
                          : "text-ink"
                      }
                    >
                      {formatEur(c.balanceEur)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {c.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── pagination ────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-[12px] text-ink-mid">
          <div>
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildPagedHref(sp, page - 1)}
                className="border border-ink/20 px-3 py-1.5 hover:border-ink"
              >
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildPagedHref(sp, page + 1)}
                className="border border-ink/20 px-3 py-1.5 hover:border-ink"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}

      {!canManage && (
        <p className="mt-6 text-[11px] italic text-ink-mid">
          Read-only view — voiding or resending requires owner access.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: GiftCardStatus }) {
  const palette: Record<GiftCardStatus, string> = {
    ACTIVE: "bg-sage/30 text-ink",
    DEPLETED: "bg-ink/10 text-ink-mid",
    EXPIRED: "bg-ink/10 text-ink-mid",
    VOID: "bg-vermilion/15 text-vermilion",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-label ${palette[status]}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function formatEur(eur: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(eur);
}

function buildPagedHref(
  sp: { status?: string; q?: string },
  page: number,
): string {
  const params = new URLSearchParams();
  if (sp.status) params.set("status", sp.status);
  if (sp.q) params.set("q", sp.q);
  params.set("page", String(page));
  return `/admin/gift-cards?${params.toString()}`;
}
