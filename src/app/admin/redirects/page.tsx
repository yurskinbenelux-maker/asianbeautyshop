// ─────────────────────────────────────────────────────────────────────────
// /admin/redirects — list page. One row per redirect, sorted newest-edited
// first; a search box filters across from/to/note; a badge distinguishes
// auto-inserted rows (from slug renames) from manual ones.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Plus, ArrowRight, Zap, Hand } from "lucide-react";
import { listAdminRedirects } from "@/lib/redirects/db";
import { requireCapability } from "@/lib/auth-roles";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type SP = Promise<{ q?: string }>;

export default async function AdminRedirectsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  // Redirects shape SEO and can silently break paid-ad campaigns if
  // mis-configured. Owner-only.
  await requireCapability("redirects.edit");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const rows = await listAdminRedirects({ q });

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Redirects</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            URL redirects
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">
            When a product, category, or brand slug changes, the old URL is
            automatically redirected here to preserve bookmarks and search
            rankings. You can also add manual redirects — useful for
            renaming collection pages or retiring an old campaign URL.
          </p>
        </div>
        <Link
          href="/admin/redirects/new"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New redirect
        </Link>
      </header>

      <form className="mb-6 flex max-w-md gap-2" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search from / to / note"
          className="w-full border border-ink/15 bg-white/60 px-3 py-2 text-[13px] placeholder:text-ink-mid/60 focus:border-ink/40 focus:outline-none"
        />
        <button
          type="submit"
          className="border border-ink/15 px-4 py-2 text-[12px] uppercase tracking-label text-ink-mid hover:border-ink/30 hover:text-ink"
        >
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState query={q} />
      ) : (
        <div className="border border-ink/10 bg-white/60">
          <table className="w-full text-[13px]">
            <thead className="border-b border-ink/10 text-[10px] uppercase tracking-label text-ink-mid">
              <tr>
                <th className="px-4 py-3 text-left font-normal">From</th>
                <th className="px-4 py-3 text-left font-normal">To</th>
                <th className="px-4 py-3 text-left font-normal">Type</th>
                <th className="px-4 py-3 text-left font-normal">Source</th>
                <th className="px-4 py-3 text-left font-normal">Hits</th>
                <th className="px-4 py-3 text-left font-normal">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isAuto = r.source?.startsWith("auto:") ?? false;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-ink/5 last:border-0 hover:bg-rice/40"
                  >
                    <td className="max-w-[240px] truncate px-4 py-3 font-mono text-[12px]">
                      <Link
                        href={`/admin/redirects/${r.id}`}
                        className="text-ink hover:underline"
                        title={r.fromPath}
                      >
                        {r.fromPath}
                      </Link>
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 font-mono text-[12px] text-ink-mid">
                      <ArrowRight className="mr-2 inline h-3 w-3 text-ink-mid" />
                      <span title={r.toPath}>{r.toPath}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-mid">
                      <span
                        className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-label ${
                          r.code === "PERMANENT"
                            ? "border-sage/40 text-sage"
                            : "border-ink/15 text-ink-mid"
                        }`}
                      >
                        {r.code === "PERMANENT" ? "301" : "302"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-mid">
                      {isAuto ? (
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <Zap className="h-3 w-3" />
                          Auto
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <Hand className="h-3 w-3" />
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-mid">{r.hits}</td>
                    <td className="px-4 py-3 text-ink-mid">
                      {DATE.format(r.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-[12px] text-ink-mid">
        Redirects are evaluated when a URL would otherwise return a 404 — so
        they don't slow down live pages, but they do catch old links.
      </p>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
      <h2 className="font-display text-[22px] text-ink">
        {query ? "No redirects match that search." : "No redirects yet."}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
        {query
          ? "Try a different keyword, or clear the search to see everything."
          : "The first time you rename a product slug, an automatic redirect will appear here."}
      </p>
      {!query && (
        <Link
          href="/admin/redirects/new"
          className="mt-6 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add the first redirect
        </Link>
      )}
    </div>
  );
}
