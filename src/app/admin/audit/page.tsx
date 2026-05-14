// ─────────────────────────────────────────────────────────────────────────
// /admin/audit — append-only log of admin mutations.
//
// Read-only: an admin can't edit entries from the UI (audit integrity). She can
// search and filter by action/date. Entries are capped at 200 per query —
// we'll add pagination later if the list outgrows that.
// ─────────────────────────────────────────────────────────────────────────

import { requireCapability } from "@/lib/auth-roles";
import { listAuditLog, listAuditActions } from "@/lib/audit/db";
import { History, Search } from "lucide-react";
import { ADMIN_DATETIME_FMT } from "@/lib/utils/format-date";

type AuditRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  meta: unknown;
  createdAt: Date;
};

export const dynamic = "force-dynamic";

const DATE = ADMIN_DATETIME_FMT;

type SearchParams = Promise<{
  q?: string;
  action?: string;
}>;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Audit log is owner-only — it shows who did what, including sensitive
  // actions (role grants, settings edits, coupon creation). Editors and
  // fulfilment shouldn't be able to audit their peers.
  await requireCapability("audit.view");
  const sp = await searchParams;

  const [rows, actions] = await Promise.all([
    listAuditLog({ q: sp.q, action: sp.action }),
    listAuditActions(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8">
        <div className="eyebrow">Audit</div>
        <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
          Activity log
        </h1>
        <p className="mt-3 max-w-xl text-[13px] text-ink-mid">
          Every admin mutation — who changed what, when. Append-only. Nothing
          here can be edited; this is your paper trail.
        </p>
      </header>

      {/* filters */}
      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 border-b border-ink/10 pb-6"
      >
        <label className="flex-1 min-w-[220px]">
          <span className="block text-[11px] uppercase tracking-label text-ink-mid">
            Search
          </span>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid" />
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="action, summary, id, email"
              className="w-full border border-ink/15 bg-white px-3 py-2 pl-9 text-[13px] text-ink focus:border-ink/40 focus:outline-none"
            />
          </div>
        </label>

        <label className="min-w-[200px]">
          <span className="block text-[11px] uppercase tracking-label text-ink-mid">
            Action
          </span>
          <select
            name="action"
            defaultValue={sp.action ?? ""}
            className="mt-1 w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink/40 focus:outline-none"
          >
            <option value="">Any action</option>
            {actions.map((a: string) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
        >
          Filter
        </button>
      </form>

      {/* list */}
      {rows.length === 0 ? (
        <div className="border border-dashed border-ink/20 px-4 py-10 md:px-8 md:py-16 text-center">
          <History className="mx-auto h-8 w-8 text-ink-mid" aria-hidden />
          <p className="mt-3 text-[13px] text-ink-mid">
            No entries match these filters yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink/10 border-y border-ink/10">
          {rows.map((r: AuditRow) => (
            <li key={r.id} className="grid grid-cols-[140px_180px_1fr] gap-4 px-2 py-4 text-[13px]">
              <time
                dateTime={r.createdAt.toISOString()}
                className="text-ink-mid"
              >
                {DATE.format(r.createdAt)}
              </time>
              <div>
                <div className="font-mono text-[11px] text-ink">{r.action}</div>
                <div className="mt-0.5 text-[11px] text-ink-mid">
                  {r.actorEmail ?? "system"}
                </div>
              </div>
              <div>
                <div className="text-ink">{r.summary}</div>
                {(r.entityType || r.entityId) && (
                  <div className="mt-0.5 text-[11px] text-ink-mid">
                    {r.entityType ? `${r.entityType} · ` : ""}
                    {r.entityId ? (
                      <span className="font-mono">{r.entityId}</span>
                    ) : (
                      ""
                    )}
                  </div>
                )}
                {Boolean(r.meta) &&
                  Object.keys(r.meta as object).length > 0 && (
                    <pre className="mt-2 max-w-full overflow-x-auto border border-ink/10 bg-ivory/50 p-2 text-[11px] text-ink-mid">
                      {JSON.stringify(r.meta, null, 2)}
                    </pre>
                  )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[11px] text-ink-mid">
        Showing up to 200 most recent entries. Older activity is retained in
        the database — tighten the filters to find it.
      </p>
    </div>
  );
}
