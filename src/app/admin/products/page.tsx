// ─────────────────────────────────────────────────────────────────────────
// /admin/products — the product catalogue.
//
// Server component: does its own Prisma query, renders a table. Search is
// URL-driven (?q=foo) so refreshes are cheap and bookmarks work. Status
// filter likewise (?status=PUBLISHED).
//
// The "New product" button posts to the createProduct server action which
// makes a blank draft and redirects to the editor.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  CloudUpload,
  Copy,
  Plus,
  Search,
  RotateCcw,
  Trash2,
  Rocket,
} from "lucide-react";
import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { formatAdminDate } from "@/lib/utils/format-date";
import {
  bulkPublishDraftsAction,
  createProduct,
  duplicateProduct,
  hardDeleteProduct,
  restoreProduct,
} from "./actions";

export const dynamic = "force-dynamic";

// Pseudo-status used in the URL only (never written to the DB) to surface
// soft-deleted products in a Trash bucket. Lifted to module scope so the
// buildStatusHref helper below can typecheck against it.
type StatusFilter = ProductStatus | "TRASH";

type SearchParams = Promise<{
  q?: string;
  status?: string;
  err?: string;
  /** Set by bulkPublishDraftsAction's redirect — drives the green banner. */
  published?: string;
  publishedNone?: string;
  skipped?: string;
}>;

export default async function ProductsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q, status, err, published, publishedNone, skipped } =
    await searchParams;
  const statusFilter: StatusFilter | undefined =
    status === "DRAFT" ||
    status === "PUBLISHED" ||
    status === "ARCHIVED" ||
    status === "TRASH"
      ? (status as StatusFilter)
      : undefined;

  const isTrash = statusFilter === "TRASH";

  const where: Prisma.ProductWhereInput = {
    // Trash mode flips the soft-delete filter; otherwise we hide deleted.
    ...(isTrash
      ? { NOT: { deletedAt: null } }
      : { deletedAt: null }),
    ...(statusFilter && !isTrash ? { status: statusFilter } : {}),
    ...(q && q.trim()
      ? {
          OR: [
            { sku: { contains: q.trim(), mode: "insensitive" } },
            {
              translations: {
                some: {
                  name: { contains: q.trim(), mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {}),
  };

  const products = await prisma.product.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      sku: true,
      status: true,
      price: true,
      isBestseller: true,
      isFeatured: true,
      updatedAt: true,
      translations: {
        where: { locale: "EN" },
        select: { name: true, slug: true },
      },
    },
  });

  const [
    total,
    publishedCount,
    draftCount,
    archivedCount,
    trashCount,
    publishableDraftCount,
  ] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null, status: "PUBLISHED" } }),
    prisma.product.count({ where: { deletedAt: null, status: "DRAFT" } }),
    prisma.product.count({ where: { deletedAt: null, status: "ARCHIVED" } }),
    // Trash = soft-deleted regardless of status.
    prisma.product.count({ where: { NOT: { deletedAt: null } } }),
    // Drafts that have a real price set — drives the "Publish all drafts"
    // button label and visibility. €0 drafts are excluded so a one-click
    // bulk action can't accidentally make products buyable for free.
    prisma.product.count({
      where: {
        deletedAt: null,
        status: "DRAFT",
        price: { gt: new Prisma.Decimal("0") },
      },
    }),
  ]);

  // €0 drafts that the bulk action would skip — useful copy under the button.
  const zeroPricedDraftCount = draftCount - publishableDraftCount;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      {/* masthead */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Catalogue</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            Products
          </h1>
          <p className="mt-2 text-[13px] text-ink-mid">
            {total} in the catalogue · {publishedCount} live · {draftCount}{" "}
            drafts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bulk publish — only shown when there's something to publish.
              Skips €0 drafts (the import default) so a click can't make
              products buyable for free. */}
          {publishableDraftCount > 0 && (
            <form action={bulkPublishDraftsAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 border border-gold/40 bg-gold/10 px-4 py-2 text-[12px] uppercase tracking-label text-gold transition-colors hover:border-gold hover:bg-gold hover:text-white"
                title="Flips every DRAFT with a real price (€>0) to PUBLISHED in one click."
              >
                <Rocket className="h-4 w-4" aria-hidden />
                Publish {publishableDraftCount}{" "}
                {publishableDraftCount === 1 ? "draft" : "drafts"}
              </button>
            </form>
          )}

          {/* Secondary: bulk CSV import — link to /admin/products/import */}
          <Link
            href="/admin/products/import"
            className="inline-flex items-center gap-2 border border-ink/15 bg-white/60 px-4 py-2 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-white"
          >
            <CloudUpload className="h-4 w-4" aria-hidden />
            Import CSV
          </Link>

          {/* "New product" button — Server Action form */}
          <form action={createProduct}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90"
            >
              <Plus className="h-4 w-4" />
              New product
            </button>
          </form>
        </div>
      </header>

      {/* Hint under the masthead when there's a tail of €0 drafts that
          the bulk action would skip — gives an admin a nudge to set prices
          before clicking. */}
      {publishableDraftCount > 0 && zeroPricedDraftCount > 0 && (
        <p className="mt-3 text-[11px] uppercase tracking-label text-ink-mid">
          {zeroPricedDraftCount}{" "}
          {zeroPricedDraftCount === 1 ? "draft" : "drafts"} at €0 will be
          skipped — set a price first.
        </p>
      )}

      {/* filters */}
      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-6">
        <form method="get" className="relative flex-1 max-w-sm">
          {/* Preserve status filter on search submit */}
          {statusFilter && (
            <input type="hidden" name="status" value={statusFilter} />
          )}
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mid" />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name or SKU"
            className="w-full border border-ink/15 bg-white py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-1 text-[11px] uppercase tracking-label">
          <StatusPill
            label={`All · ${total}`}
            href={buildStatusHref(null, q)}
            active={!statusFilter}
          />
          <StatusPill
            label={`Live · ${publishedCount}`}
            href={buildStatusHref("PUBLISHED", q)}
            active={statusFilter === "PUBLISHED"}
          />
          <StatusPill
            label={`Drafts · ${draftCount}`}
            href={buildStatusHref("DRAFT", q)}
            active={statusFilter === "DRAFT"}
          />
          <StatusPill
            label={`Archived · ${archivedCount}`}
            href={buildStatusHref("ARCHIVED", q)}
            active={statusFilter === "ARCHIVED"}
          />
          {/* Trash bucket — only present when there's something in it,
              so the filter rail stays calm in the common case. */}
          {trashCount > 0 && (
            <StatusPill
              label={`Trash · ${trashCount}`}
              href={buildStatusHref("TRASH", q)}
              active={isTrash}
            />
          )}
        </div>
      </div>

      {/* err query param surfaced from hard-delete refusal. Cheap toast. */}
      {err === "order-refs" && (
        <div className="mt-4 border border-vermilion/30 bg-vermilion/5 px-4 py-3 text-[12px] text-vermilion">
          Couldn&rsquo;t delete: that product has variants referenced by past
          orders. Keep the trashed row instead — it preserves order history.
        </div>
      )}

      {/* Bulk-publish result banners. The action redirects with one of:
          ?published=N&skipped=M     — green success, optional skip note
          ?publishedNone=1&skipped=M — amber "nothing to do, all at €0"
      */}
      {published && Number(published) > 0 && (
        <div className="mt-4 border border-gold/40 bg-gold/10 px-4 py-3 text-[12px] text-gold">
          Published {published}{" "}
          {Number(published) === 1 ? "product" : "products"}.
          {skipped && Number(skipped) > 0 && (
            <>
              {" "}
              Skipped {skipped} at €0 — set their prices first, then run
              again.
            </>
          )}
        </div>
      )}
      {publishedNone === "1" && (
        <div className="mt-4 border border-vermilion/30 bg-vermilion/5 px-4 py-3 text-[12px] text-vermilion">
          Nothing to publish — all draft products are at €0. Set a price
          on at least one before clicking Publish drafts.
        </div>
      )}

      {/* table */}
      <div className="mt-6 border border-ink/10 bg-white/60">
        {products.length === 0 ? (
          <EmptyState hasFilters={Boolean(q) || Boolean(statusFilter)} />
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
                <Th className="w-[42%]">Product</Th>
                <Th>SKU</Th>
                <Th>Status</Th>
                <Th className="text-right">Price</Th>
                <Th>Updated</Th>
                {/*
                  Actions column — currently just Duplicate. Narrow so the
                  rest of the table keeps the spacious rhythm an admin is used
                  to, and right-aligned so the icon lines up with the edge.
                */}
                <Th className="w-[1%] text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const name = p.translations[0]?.name ?? "Untitled product";
                return (
                  <tr
                    key={p.id}
                    className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]"
                  >
                    <Td>
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="block text-ink hover:underline"
                      >
                        <span className="font-display text-[15px]">{name}</span>
                        <div className="mt-0.5 flex gap-1.5 text-[10px] uppercase tracking-label text-ink-mid">
                          {p.isBestseller && <span>Bestseller</span>}
                          {p.isFeatured && <span>Featured</span>}
                        </div>
                      </Link>
                    </Td>
                    <Td className="font-mono text-[12px] text-ink-mid">
                      {p.sku}
                    </Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                    <Td className="text-right tabular-nums">
                      € {Number(p.price).toFixed(2)}
                    </Td>
                    <Td className="text-ink-mid">
                      {formatAdminDate(p.updatedAt)}
                    </Td>
                    <Td className="text-right">
                      {/*
                        In normal views: Duplicate.
                        In Trash view: Restore + Delete-permanently. Both
                        are tiny per-row forms because Next's Server Actions
                        need a form. Hard-delete is gated server-side: it
                        only fires on already-trashed rows and refuses if
                        any past OrderItem references a variant.
                      */}
                      {isTrash ? (
                        <div className="flex justify-end gap-1">
                          <form action={restoreProduct}>
                            <input type="hidden" name="productId" value={p.id} />
                            <button
                              type="submit"
                              aria-label={`Restore ${name}`}
                              title="Restore — bring back into the catalogue"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-mid transition-colors hover:bg-ink/5 hover:text-ink"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </form>
                          <form action={hardDeleteProduct}>
                            <input type="hidden" name="productId" value={p.id} />
                            <button
                              type="submit"
                              aria-label={`Delete ${name} permanently`}
                              title="Delete permanently — frees the SKU"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-vermilion transition-colors hover:bg-vermilion hover:text-white"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </form>
                        </div>
                      ) : (
                        <form action={duplicateProduct}>
                          <input
                            type="hidden"
                            name="productId"
                            value={p.id}
                          />
                          <button
                            type="submit"
                            aria-label={`Duplicate ${name}`}
                            title="Duplicate — creates a draft copy"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-mid transition-colors hover:bg-ink/5 hover:text-ink"
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </form>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

// ──────── small helpers local to this page ──────────────────────────────

function buildStatusHref(status: StatusFilter | null, q?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `/admin/products?${qs}` : "/admin/products";
}

function StatusPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "border px-2.5 py-1 transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-ink/15 text-ink-mid hover:border-ink hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={cn("px-4 py-3 font-normal", className)}>{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

function StatusBadge({ status }: { status: ProductStatus }) {
  const map: Record<ProductStatus, { label: string; className: string }> = {
    PUBLISHED: {
      label: "Live",
      className: "bg-gold/15 text-gold",
    },
    DRAFT: {
      label: "Draft",
      className: "bg-ink/5 text-ink-mid",
    },
    ARCHIVED: {
      label: "Archived",
      className: "bg-vermilion/10 text-vermilion",
    },
  };
  const cfg = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-label",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="font-display text-[22px] text-ink">
        {hasFilters ? "No matches" : "No products yet"}
      </div>
      <p className="mt-2 max-w-sm text-[13px] text-ink-mid">
        {hasFilters
          ? "Try clearing the filters or searching for a different name."
          : "Click \u201cNew product\u201d to create the first one."}
      </p>
    </div>
  );
}
