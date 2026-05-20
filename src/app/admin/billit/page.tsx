// ─────────────────────────────────────────────────────────────────────────
// /admin/billit — accountant-mirror health + reconciliation dashboard.
//
// Max can't log into K'Elmus' Billit account directly. This page is his
// substitute view:
//
//   · Connection health bar at top (sandbox/production + K'Elmus company
//     identity) so a wrong-environment misconfiguration is obvious.
//   · Stats grid showing how many invoices/CNs landed cleanly vs are
//     pending, failed, or mismatched in the last 90 days.
//   · Combined table of every Invoice + CreditNote with push status,
//     totals diff, last attempt, attempt count, manual retry button.
//
// OWNER-only. Surfacing BTW totals + a button that reaches into the
// accounting platform are both money-coded actions.
// ─────────────────────────────────────────────────────────────────────────

import { Banknote, CheckCircle2, AlertTriangle, Clock, XCircle, RefreshCcw } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { billitPing } from "@/lib/invoices/billit/client";
import { hasBillitConfig, loadBillitConfig } from "@/lib/invoices/billit/env";
import { ADMIN_DATETIME_FMT } from "@/lib/utils/format-date";
import { retryBillitPushAction } from "./actions";

export const dynamic = "force-dynamic";

type FilterStatus = "all" | "pushed" | "pending" | "failed" | "mismatch";
type FilterKind = "all" | "invoice" | "creditNote";

type SearchParams = Promise<{
  status?: string;
  kind?: string;
  q?: string;
}>;

type Row = {
  kind: "invoice" | "creditNote";
  id: string;
  number: string;
  issuedAt: Date;
  ourGrandTotal: number;
  ourVatTotal: number;
  billitPushedAt: Date | null;
  billitInvoiceId: string | null;
  billitErrorMessage: string | null;
  billitAttemptCount: number;
  billitLastAttemptAt: Date | null;
  billitSnapshot: unknown;
};

type DerivedStatus = "pushed" | "mismatch" | "failed" | "pending";

export default async function BillitDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapability("billit.view");
  const sp = await searchParams;

  const filterStatus: FilterStatus = isFilterStatus(sp.status)
    ? sp.status
    : "all";
  const filterKind: FilterKind = isFilterKind(sp.kind) ? sp.kind : "all";
  const search = (sp.q ?? "").trim().toUpperCase();

  // Pull the last 90 days. Older rows are uncommon to need retry; the
  // cron in step 6 sweeps the same window so /admin/billit and the
  // cron stay in agreement.
  const sinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [pingResult, invoices, creditNotes] = await Promise.all([
    hasBillitConfig() ? billitPing() : Promise.resolve(null),
    prisma.invoice.findMany({
      where: { issuedAt: { gte: sinceDate } },
      orderBy: { issuedAt: "desc" },
      select: invoiceSelect,
      take: 500,
    }),
    prisma.creditNote.findMany({
      where: { issuedAt: { gte: sinceDate } },
      orderBy: { issuedAt: "desc" },
      select: creditNoteSelect,
      take: 500,
    }),
  ]);

  const allRows: Row[] = [
    ...invoices.map((i) => ({
      kind: "invoice" as const,
      id: i.id,
      number: i.number,
      issuedAt: i.issuedAt,
      ourGrandTotal: Number(i.grandTotal),
      ourVatTotal: Number(i.vatTotal),
      billitPushedAt: i.billitPushedAt,
      billitInvoiceId: i.billitInvoiceId,
      billitErrorMessage: i.billitErrorMessage,
      billitAttemptCount: i.billitAttemptCount,
      billitLastAttemptAt: i.billitLastAttemptAt,
      billitSnapshot: i.billitSnapshot,
    })),
    ...creditNotes.map((c) => ({
      kind: "creditNote" as const,
      id: c.id,
      number: c.number,
      issuedAt: c.issuedAt,
      ourGrandTotal: Number(c.grandTotal),
      ourVatTotal: Number(c.vatTotal),
      billitPushedAt: c.billitPushedAt,
      billitInvoiceId: c.billitInvoiceId,
      billitErrorMessage: c.billitErrorMessage,
      billitAttemptCount: c.billitAttemptCount,
      billitLastAttemptAt: c.billitLastAttemptAt,
      billitSnapshot: c.billitSnapshot,
    })),
  ].sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());

  const stats = computeStats(allRows);

  const rows = allRows.filter((r) => {
    const derived = deriveStatus(r);
    if (filterStatus !== "all" && derived !== filterStatus) return false;
    if (filterKind !== "all" && r.kind !== filterKind) return false;
    if (search && !r.number.toUpperCase().includes(search)) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8">
        <div className="eyebrow">Books</div>
        <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
          Billit reconciliation
        </h1>
        <p className="mt-3 max-w-2xl text-[13px] text-ink-mid">
          Every invoice and credit note we issue is mirrored into K&apos;Elmus&apos;
          Billit account so the accountant can file BTW from there. This page
          shows push status, surfaces mismatches, and lets you retry a row.
          Our own invoice system remains the customer-facing source of truth.
        </p>
      </header>

      {/* Connection health */}
      <ConnectionBanner pingResult={pingResult} />

      {/* Stats grid */}
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Pushed cleanly"
          value={stats.pushed}
          tone="ok"
          icon={CheckCircle2}
        />
        <StatTile
          label="Pending push"
          value={stats.pending}
          tone="muted"
          icon={Clock}
        />
        <StatTile
          label="Failed"
          value={stats.failed}
          tone="bad"
          icon={XCircle}
        />
        <StatTile
          label="Mismatch (€ differs)"
          value={stats.mismatch}
          tone="warn"
          icon={AlertTriangle}
        />
      </section>

      {/* Filters */}
      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 border-b border-ink/10 pb-6"
      >
        <label>
          <span className="block text-[11px] uppercase tracking-label text-ink-mid">
            Status
          </span>
          <select
            name="status"
            defaultValue={filterStatus}
            className="mt-1 border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink/40 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="pushed">Pushed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="mismatch">Mismatch</option>
          </select>
        </label>
        <label>
          <span className="block text-[11px] uppercase tracking-label text-ink-mid">
            Type
          </span>
          <select
            name="kind"
            defaultValue={filterKind}
            className="mt-1 border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink/40 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="invoice">Invoices</option>
            <option value="creditNote">Credit notes</option>
          </select>
        </label>
        <label className="min-w-[180px] flex-1">
          <span className="block text-[11px] uppercase tracking-label text-ink-mid">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="INV-2026-… / CN-2026-…"
            className="mt-1 w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink/40 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-paper hover:bg-ink/85"
        >
          Apply
        </button>
      </form>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="border border-dashed border-ink/15 bg-paper py-16 text-center text-[13px] text-ink-mid">
          No invoices or credit notes match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto border border-ink/10 bg-white">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead className="border-b border-ink/10 bg-paper text-[11px] uppercase tracking-label text-ink-mid">
              <tr>
                <th className="px-3 py-2 text-left">Number</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Issued</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Our grand</th>
                <th className="px-3 py-2 text-right">Billit grand</th>
                <th className="px-3 py-2 text-left">Billit ID</th>
                <th className="px-3 py-2 text-left">Last attempt</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <TableRow key={`${r.kind}-${r.id}`} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ────────── Sub-components ───────────────────────────────────────────────

function ConnectionBanner({
  pingResult,
}: {
  pingResult: Awaited<ReturnType<typeof billitPing>> | null;
}) {
  if (!hasBillitConfig()) {
    return (
      <div className="mb-6 border border-amber-400/40 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
        <div className="font-medium">Billit not configured</div>
        <div className="mt-1 text-amber-900/80">
          Set <code>BILLIT_BASE_URL</code>, <code>BILLIT_PARTY_ID</code>, and{" "}
          <code>BILLIT_API_KEY</code> in Hostinger → Node.js app → Environment
          variables. Until then, every push call returns &quot;skipped&quot;
          and no rows reach Billit.
        </div>
      </div>
    );
  }
  const cfg = loadBillitConfig();
  const envTone =
    cfg?.environment === "production"
      ? "border-emerald-400/40 bg-emerald-50 text-emerald-900"
      : "border-sky-400/40 bg-sky-50 text-sky-900";

  if (pingResult && !pingResult.ok) {
    return (
      <div className="mb-6 border border-red-400/40 bg-red-50 px-4 py-3 text-[13px] text-red-900">
        <div className="font-medium">Billit unreachable</div>
        <div className="mt-1 text-red-900/80">{pingResult.error}</div>
        <div className="mt-2 text-[11px] text-red-900/60">
          Common causes: wrong PartyID for the configured environment, key
          expired, or sandbox URL with a production PartyID (or vice versa).
        </div>
      </div>
    );
  }

  return (
    <div className={`mb-6 border px-4 py-3 text-[13px] ${envTone}`}>
      <div className="flex items-center gap-2 font-medium">
        <Banknote className="h-4 w-4" />
        Connected — {cfg?.environment.toUpperCase()}
      </div>
      <div className="mt-1 text-[12px] opacity-80">
        Pushing to <code>{cfg?.baseUrl}</code> with PartyID{" "}
        <code>{cfg?.partyId.slice(0, 8)}…</code>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "ok" | "muted" | "warn" | "bad";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneCls = {
    ok: "text-emerald-700",
    muted: "text-ink-mid",
    warn: "text-amber-700",
    bad: "text-red-700",
  }[tone];
  return (
    <div className="border border-ink/10 bg-white p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid">
        <Icon className={`h-3.5 w-3.5 ${toneCls}`} />
        {label}
      </div>
      <div className={`mt-2 font-display text-[28px] ${toneCls}`}>{value}</div>
    </div>
  );
}

function TableRow({ row }: { row: Row }) {
  const status = deriveStatus(row);
  const billitGrand = extractBillitGrand(row.billitSnapshot);
  const delta =
    billitGrand != null ? round2(billitGrand - row.ourGrandTotal) : null;

  return (
    <tr className="border-t border-ink/10 hover:bg-paper/50">
      <td className="px-3 py-2 font-mono text-[12px]">{row.number}</td>
      <td className="px-3 py-2 text-ink-mid">
        {row.kind === "invoice" ? "Invoice" : "Credit note"}
      </td>
      <td className="px-3 py-2 text-ink-mid">
        {ADMIN_DATETIME_FMT.format(row.issuedAt)}
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={status} />
        {row.billitErrorMessage ? (
          <div
            className="mt-1 max-w-xs truncate text-[11px] text-red-700"
            title={row.billitErrorMessage}
          >
            {row.billitErrorMessage}
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2 text-right font-mono text-[12px]">
        €{row.ourGrandTotal.toFixed(2)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-[12px]">
        {billitGrand != null ? (
          <>
            €{billitGrand.toFixed(2)}
            {delta != null && Math.abs(delta) > 0.01 ? (
              <div className="text-[11px] text-red-700">
                Δ €{delta.toFixed(2)}
              </div>
            ) : null}
          </>
        ) : (
          <span className="text-ink-mid">—</span>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-ink-mid">
        {row.billitInvoiceId ? (
          <span title={row.billitInvoiceId}>
            {row.billitInvoiceId.slice(0, 8)}…
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2 text-[11px] text-ink-mid">
        {row.billitLastAttemptAt ? (
          <>
            {ADMIN_DATETIME_FMT.format(row.billitLastAttemptAt)}
            <div className="text-[10px]">
              {row.billitAttemptCount}{" "}
              {row.billitAttemptCount === 1 ? "attempt" : "attempts"}
            </div>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2">
        <RetryForm kind={row.kind} id={row.id} />
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: DerivedStatus }) {
  const map: Record<
    DerivedStatus,
    { label: string; cls: string }
  > = {
    pushed: { label: "Pushed", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    pending: { label: "Pending", cls: "bg-ink/5 text-ink-mid border-ink/15" },
    failed: { label: "Failed", cls: "bg-red-50 text-red-800 border-red-200" },
    mismatch: { label: "Mismatch", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[11px] uppercase tracking-label ${cls}`}
    >
      {label}
    </span>
  );
}

function RetryForm({
  kind,
  id,
}: {
  kind: "invoice" | "creditNote";
  id: string;
}) {
  // Server actions can be bound and used directly as a form action.
  // The page revalidates inside retryBillitPushAction so a successful
  // retry refreshes the row's status without a client component.
  async function action() {
    "use server";
    await retryBillitPushAction(kind, id);
  }
  return (
    <form action={action}>
      <button
        type="submit"
        className="inline-flex items-center gap-1 border border-ink/15 bg-white px-2 py-1 text-[11px] uppercase tracking-label text-ink hover:bg-paper"
        title="Retry push to Billit"
      >
        <RefreshCcw className="h-3 w-3" />
        Retry
      </button>
    </form>
  );
}

// ────────── Helpers ──────────────────────────────────────────────────────

const invoiceSelect = {
  id: true,
  number: true,
  issuedAt: true,
  grandTotal: true,
  vatTotal: true,
  billitPushedAt: true,
  billitInvoiceId: true,
  billitErrorMessage: true,
  billitAttemptCount: true,
  billitLastAttemptAt: true,
  billitSnapshot: true,
} as const;

const creditNoteSelect = invoiceSelect;

function deriveStatus(row: Row): DerivedStatus {
  // Mismatch = pushed AND we recorded an error (the reconciliation diff
  // string lives in billitErrorMessage even when pushedAt is set).
  if (row.billitPushedAt && row.billitErrorMessage) return "mismatch";
  if (row.billitPushedAt) return "pushed";
  if (row.billitErrorMessage) return "failed";
  return "pending";
}

function computeStats(rows: Row[]): {
  pushed: number;
  pending: number;
  failed: number;
  mismatch: number;
} {
  const acc = { pushed: 0, pending: 0, failed: 0, mismatch: 0 };
  for (const r of rows) acc[deriveStatus(r)] += 1;
  return acc;
}

function extractBillitGrand(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const obj = snapshot as { TotalIncl?: unknown };
  if (typeof obj.TotalIncl === "number") return obj.TotalIncl;
  if (typeof obj.TotalIncl === "string") {
    const parsed = Number.parseFloat(obj.TotalIncl);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function isFilterStatus(v: unknown): v is FilterStatus {
  return (
    v === "all" ||
    v === "pushed" ||
    v === "pending" ||
    v === "failed" ||
    v === "mismatch"
  );
}

function isFilterKind(v: unknown): v is FilterKind {
  return v === "all" || v === "invoice" || v === "creditNote";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
