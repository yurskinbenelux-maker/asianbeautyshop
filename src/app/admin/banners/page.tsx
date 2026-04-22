// ─────────────────────────────────────────────────────────────────────────
// /admin/banners — list of all placement banners, grouped by placement.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import Image from "next/image";
import { Plus, LayoutPanelTop } from "lucide-react";
import { listAdminBanners } from "@/lib/queries/admin-banners";
import { PLACEMENTS, toggleBannerActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminBannersPage() {
  const rows = await listAdminBanners();

  // Group rows by placement so the page reads like a TOC.
  const byPlacement = new Map<string, typeof rows>();
  for (const p of PLACEMENTS) byPlacement.set(p.id, []);
  for (const r of rows) {
    const bucket = byPlacement.get(r.placement) ?? [];
    bucket.push(r);
    byPlacement.set(r.placement, bucket);
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Banners</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            Homepage banners
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            Hero images, announcement strips, and promo cards. Each slot
            shows the first active, in-schedule banner (by sort order).
          </p>
        </div>
        <Link
          href="/admin/banners/new"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New banner
        </Link>
      </header>

      {rows.length === 0 && <EmptyState />}

      <div className="space-y-10">
        {PLACEMENTS.map((p) => {
          const list = byPlacement.get(p.id) ?? [];
          if (list.length === 0) return null;
          return (
            <section key={p.id}>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="font-display text-[18px] text-ink">{p.label}</h2>
                <span className="text-[11px] uppercase tracking-label text-ink-mid">
                  {list.length} banner{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((b) => (
                  <article
                    key={b.id}
                    className="group overflow-hidden border border-ink/10 bg-white/60 transition-colors hover:border-ink/30"
                  >
                    <Link href={`/admin/banners/${b.id}`} className="block">
                      <div className="relative aspect-[16/9] bg-ink/5">
                        {b.mediaUrl ? (
                          <Image
                            src={b.mediaUrl}
                            alt={b.mediaAlt ?? ""}
                            fill
                            sizes="(max-width: 640px) 100vw, 400px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-label text-ink-mid">
                            No image
                          </div>
                        )}
                        {!b.isActive && (
                          <span className="absolute left-2 top-2 border border-ink/20 bg-white/90 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="text-[14px] text-ink">
                          {b.headlineEn ?? <em>(no English headline)</em>}
                        </div>
                        <div className="mt-1 text-[11px] text-ink-mid">
                          sort {b.sortOrder}
                          {b.ctaHref ? ` · ${b.ctaHref}` : ""}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center justify-between border-t border-ink/10 px-4 py-2">
                      <form action={toggleBannerActiveAction}>
                        <input type="hidden" name="id" value={b.id} />
                        <input
                          type="hidden"
                          name="nextActive"
                          value={(!b.isActive).toString()}
                        />
                        <button
                          type="submit"
                          className={
                            b.isActive
                              ? "text-[11px] uppercase tracking-label text-sage hover:text-sage/80"
                              : "text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
                          }
                        >
                          {b.isActive ? "Active" : "Inactive"}
                        </button>
                      </form>
                      <Link
                        href={`/admin/banners/${b.id}`}
                        className="text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
                      >
                        Edit →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-ink/15 bg-white/40 px-10 py-16 text-center">
      <LayoutPanelTop className="mx-auto h-6 w-6 text-ink-mid" />
      <h2 className="mt-4 font-display text-[22px] text-ink">No banners yet</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
        Create a banner for the homepage hero, announcement strip, or a promo
        card. Upload images first in /admin/media.
      </p>
      <Link
        href="/admin/banners/new"
        className="mt-6 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
      >
        <Plus className="h-3.5 w-3.5" />
        Create the first banner
      </Link>
    </div>
  );
}
