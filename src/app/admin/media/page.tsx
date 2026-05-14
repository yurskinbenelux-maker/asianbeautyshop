// ─────────────────────────────────────────────────────────────────────────
// /admin/media — media library.
//
// Uploads happen from the product editor (that's where every image is
// born). The library lets an admin:
//   • browse every image in the catalogue at a glance
//   • find orphans (no product, no banner) and clean them up in bulk
//   • fix alt text, copy a public URL, reassign primary, or delete
//
// Layout is the same pattern as the products list: header + filter bar,
// pagination at the bottom, RSC-first with tiny islands for drawers/filters.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ImageIcon } from "lucide-react";
import {
  listAdminMedia,
  listJournalPostsForMediaPicker,
  listProductsForMediaPicker,
  MEDIA_PAGE_SIZE,
  type MediaScope,
} from "@/lib/queries/admin-media";
import { MediaFilters } from "@/components/admin/media/media-filters";
import { MediaCard } from "@/components/admin/media/media-card";
import { OrphanCleanup } from "@/components/admin/media/orphan-cleanup";
import { LibraryUploader } from "@/components/admin/media/library-uploader";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  scope?: string;
  q?: string;
  page?: string;
}>;

function parseScope(v: string | undefined): MediaScope {
  if (v === "linked" || v === "orphan") return v;
  return "all";
}

export default async function MediaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const scope = parseScope(sp.scope);
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  // The grid + the picker that lives inside each card's drawer share
  // the request — fetched in parallel because they're independent.
  const [result, pickerProducts, pickerJournalPosts] = await Promise.all([
    listAdminMedia({ scope, q }, page),
    listProductsForMediaPicker(),
    listJournalPostsForMediaPicker(),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / MEDIA_PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Library</div>
          <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
            Media
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] text-ink-mid">
            Every image in the catalogue, across every product. Upload new
            images from the product editor — this library is where you
            manage, tidy up, and fix alt text.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OrphanCleanup count={result.counts.orphan} />
        </div>
      </header>

      {/* Drag-drop / pick-files zone. Always visible at the top so
          uploading is the most prominent action on the page. */}
      <div className="mt-8">
        <LibraryUploader />
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Total images" value={result.counts.all} />
        <Stat label="Linked to products" value={result.counts.linked} />
        <Stat
          label="Orphans"
          value={result.counts.orphan}
          emphasis={result.counts.orphan > 0 ? "warn" : undefined}
        />
      </section>

      <div className="mt-8">
        <MediaFilters scope={scope} q={q} counts={result.counts} />
      </div>

      <section className="mt-8">
        {result.rows.length === 0 ? (
          <EmptyState scope={scope} hasQuery={q.length > 0} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {result.rows.map((m) => (
              <MediaCard
                key={m.id}
                media={m}
                pickerProducts={pickerProducts}
                pickerJournalPosts={pickerJournalPosts}
              />
            ))}
          </div>
        )}
      </section>

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-10 flex items-center justify-between border-t border-ink/10 pt-6"
        >
          <p className="text-[11px] uppercase tracking-label text-ink-mid">
            Page {page} of {totalPages} · {result.total} image
            {result.total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-1">
            <PageLink
              disabled={page <= 1}
              href={buildPageHref(sp, page - 1)}
              label="Previous"
            />
            <PageLink
              disabled={page >= totalPages}
              href={buildPageHref(sp, page + 1)}
              label="Next"
            />
          </div>
        </nav>
      )}
    </div>
  );
}

function buildPageHref(
  sp: { scope?: string; q?: string; page?: string },
  nextPage: number,
): string {
  const params = new URLSearchParams();
  if (sp.scope) params.set("scope", sp.scope);
  if (sp.q) params.set("q", sp.q);
  if (nextPage > 1) params.set("page", String(nextPage));
  const s = params.toString();
  return `/admin/media${s ? `?${s}` : ""}`;
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: "warn";
}) {
  return (
    <div
      className={cn(
        "border bg-white/60 px-4 py-3",
        emphasis === "warn"
          ? "border-vermilion/30"
          : "border-ink/10",
      )}
    >
      <div className="text-[10px] uppercase tracking-label text-ink-mid">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-[28px]",
          emphasis === "warn" ? "text-vermilion" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({
  scope,
  hasQuery,
}: {
  scope: MediaScope;
  hasQuery: boolean;
}) {
  return (
    <div className="border border-dashed border-ink/20 bg-white/60 px-4 py-10 md:px-8 md:py-16 text-center">
      <ImageIcon className="mx-auto h-8 w-8 text-ink-mid" />
      <p className="mt-3 font-display text-[18px] text-ink">
        {hasQuery
          ? "No images match that search."
          : scope === "orphan"
            ? "No orphan images — your library is tidy."
            : "No images yet."}
      </p>
      {!hasQuery && scope !== "orphan" && (
        <p className="mt-2 text-[12px] text-ink-mid">
          Images are uploaded from the product editor.{" "}
          <Link
            href="/admin/products"
            className="underline underline-offset-2 hover:text-ink"
          >
            Go to products
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function PageLink({
  disabled,
  href,
  label,
}: {
  disabled: boolean;
  href: string;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex cursor-not-allowed items-center border border-ink/10 px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid/40">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center border border-ink/15 px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
    >
      {label}
    </Link>
  );
}
