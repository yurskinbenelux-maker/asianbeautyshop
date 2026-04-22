// ─────────────────────────────────────────────────────────────────────────
// /admin/testimonials — list page for the homepage "voices" strip.
//
// Server component: reads every testimonial (regardless of isActive) so
// Sofia can see hidden ones too, then renders a compact table with the
// EN-preview quote, language count, rating, and active toggle.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Plus, Quote, Eye, EyeOff } from "lucide-react";
import { listAdminTestimonials } from "@/lib/queries/admin-testimonials";
import { toggleTestimonialActiveAction } from "./actions";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function AdminTestimonialsPage() {
  const rows = await listAdminTestimonials();

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Testimonials</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            Customer voices
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            The three quotes on the homepage. Add up to four languages per
            quote — English is required, the rest fall back to it.
          </p>
        </div>
        <Link
          href="/admin/testimonials/new"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New testimonial
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="border border-ink/10 bg-white/60">
          <table className="w-full text-[13px]">
            <thead className="border-b border-ink/10 text-[10px] uppercase tracking-label text-ink-mid">
              <tr>
                <th className="px-4 py-3 text-left font-normal">Quote (EN)</th>
                <th className="px-4 py-3 text-left font-normal">Author</th>
                <th className="px-4 py-3 text-left font-normal">Rating</th>
                <th className="px-4 py-3 text-left font-normal">Languages</th>
                <th className="px-4 py-3 text-left font-normal">Order</th>
                <th className="px-4 py-3 text-left font-normal">Status</th>
                <th className="px-4 py-3 text-left font-normal">Updated</th>
                <th className="px-4 py-3 text-right font-normal sr-only">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-ink/5 last:border-0 hover:bg-rice/40"
                >
                  <td className="max-w-md px-4 py-3">
                    <Link
                      href={`/admin/testimonials/${r.id}`}
                      className="block truncate text-ink"
                      title={r.quotePreview ?? undefined}
                    >
                      {r.quotePreview ?? (
                        <em className="text-ink-mid">(no quote)</em>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {r.authorPreview ?? <em>—</em>}
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {r.rating} / 5
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {r.translationCount} / 4
                  </td>
                  <td className="px-4 py-3 text-ink-mid">{r.sortOrder}</td>
                  <td className="px-4 py-3">
                    {r.isActive ? (
                      <span className="inline-block border border-sage/40 px-2 py-0.5 text-[10px] uppercase tracking-label text-sage">
                        Live
                      </span>
                    ) : (
                      <span className="inline-block border border-ink/15 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                        Hidden
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-mid">
                    {DATE.format(r.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* One-click hide/show — no page navigation. */}
                    <form action={toggleTestimonialActiveAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
                        title={r.isActive ? "Hide from homepage" : "Show on homepage"}
                      >
                        {r.isActive ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            Hide
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            Show
                          </>
                        )}
                      </button>
                    </form>
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
      <Quote className="mx-auto h-6 w-6 text-ink-mid" />
      <h2 className="mt-4 font-display text-[22px] text-ink">
        No customer voices yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
        Until you add your first testimonial, the homepage shows three
        editorial placeholders. Add real quotes and they'll take over.
      </p>
      <Link
        href="/admin/testimonials/new"
        className="mt-6 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
      >
        <Plus className="h-3.5 w-3.5" />
        Add the first quote
      </Link>
    </div>
  );
}
