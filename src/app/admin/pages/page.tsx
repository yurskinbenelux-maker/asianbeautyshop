// ─────────────────────────────────────────────────────────────────────────
// /admin/pages — list of all static pages (about, faq, shipping, legal…).
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { listAdminPages } from "@/lib/queries/admin-pages";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function AdminPagesPage() {
  const rows = await listAdminPages();

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Pages</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            Static pages
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            About, FAQ, shipping, legal. Each page has a stable URL key and a
            title + body per language.
          </p>
        </div>
        <Link
          href="/admin/pages/new"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New page
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="border border-ink/10 bg-white/60">
          <table className="w-full text-[13px]">
            <thead className="border-b border-ink/10 text-[10px] uppercase tracking-label text-ink-mid">
              <tr>
                <th className="px-4 py-3 text-left font-normal">Key</th>
                <th className="px-4 py-3 text-left font-normal">Title (EN)</th>
                <th className="px-4 py-3 text-left font-normal">Languages</th>
                <th className="px-4 py-3 text-left font-normal">Status</th>
                <th className="px-4 py-3 text-left font-normal">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.key}
                  className="border-b border-ink/5 last:border-0 hover:bg-rice/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/pages/${p.key}`}
                      className="font-mono tracking-label text-ink"
                    >
                      {p.key}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {p.titleEn ?? <em className="text-ink-mid">(missing)</em>}
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {p.translationCount} / 4
                  </td>
                  <td className="px-4 py-3">
                    {p.isActive ? (
                      <span className="inline-block border border-sage/40 px-2 py-0.5 text-[10px] uppercase tracking-label text-sage">
                        Published
                      </span>
                    ) : (
                      <span className="inline-block border border-ink/15 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                        Off
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {DATE.format(p.updatedAt)}
                  </td>
                </tr>
              ))}
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
      <FileText className="mx-auto h-6 w-6 text-ink-mid" />
      <h2 className="mt-4 font-display text-[22px] text-ink">No pages yet</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
        Create pages for About, FAQ, shipping, or any other static content. The
        key you pick becomes the URL.
      </p>
      <Link
        href="/admin/pages/new"
        className="mt-6 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
      >
        <Plus className="h-3.5 w-3.5" />
        Create the first page
      </Link>
    </div>
  );
}
