// ─────────────────────────────────────────────────────────────────────────
// /admin/journal — list of all journal posts.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import Image from "next/image";
import { Plus, BookOpen } from "lucide-react";
import { listAdminJournal } from "@/lib/queries/admin-journal";
import { ADMIN_DATE_FMT } from "@/lib/utils/format-date";

export const dynamic = "force-dynamic";

const DATE = ADMIN_DATE_FMT;

export default async function AdminJournalPage() {
  const rows = await listAdminJournal();

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Journal</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            Articles & notes
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            Long-form posts for the journal. Each post has one copy per
            language; English is the fallback if a translation is missing.
          </p>
        </div>
        <Link
          href="/admin/journal/new"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New post
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="border border-ink/10 bg-white/60">
          <table className="w-full text-[13px]">
            <thead className="border-b border-ink/10 text-[10px] uppercase tracking-label text-ink-mid">
              <tr>
                <th className="px-4 py-3 text-left font-normal">Title</th>
                <th className="px-4 py-3 text-left font-normal">Status</th>
                <th className="px-4 py-3 text-left font-normal">Published</th>
                <th className="px-4 py-3 text-left font-normal">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-ink/5 last:border-0 hover:bg-rice/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/journal/${p.id}`}
                      className="flex items-center gap-3"
                    >
                      <div className="relative h-12 w-16 flex-shrink-0 overflow-hidden border border-ink/10 bg-ink/5">
                        {p.coverUrl ? (
                          <Image
                            src={p.coverUrl}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div>
                        <div className="text-ink">
                          {p.titleEn ?? <em>(no English title)</em>}
                        </div>
                        {p.slugEn && (
                          <div className="mt-0.5 font-mono text-[11px] text-ink-mid">
                            /journal/{p.slugEn}
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {p.publishedAt ? DATE.format(p.publishedAt) : "—"}
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

function StatusPill({ status }: { status: "DRAFT" | "PUBLISHED" | "SCHEDULED" }) {
  const map = {
    DRAFT: "border-ink/15 text-ink-mid",
    PUBLISHED: "border-sage/40 text-sage",
    SCHEDULED: "border-gold/40 text-gold",
  } as const;
  const label = {
    DRAFT: "Draft",
    PUBLISHED: "Published",
    SCHEDULED: "Scheduled",
  }[status];
  return (
    <span
      className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-label ${map[status]}`}
    >
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
      <BookOpen className="mx-auto h-6 w-6 text-ink-mid" />
      <h2 className="mt-4 font-display text-[22px] text-ink">No journal posts yet</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
        The journal is a quiet place for ritual notes, ingredient stories, and
        brand updates. Write your first entry to turn it on.
      </p>
      <Link
        href="/admin/journal/new"
        className="mt-6 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
      >
        <Plus className="h-3.5 w-3.5" />
        Write the first post
      </Link>
    </div>
  );
}
