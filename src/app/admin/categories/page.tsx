// ─────────────────────────────────────────────────────────────────────────
// /admin/categories — tree view of categories.
//
// Renders as a flat indented list with up/down reorder buttons. Each row
// shows: name (EN), slug, product count, parent breadcrumb, and a
// "Toggle active" action.
//
// URL params supported:
//   ?saved=1    — toast-like banner after successful edit
//   ?deleted=1  — after delete
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Plus, FolderTree, CheckCircle2, Trash2 } from "lucide-react";
import { Locale } from "@prisma/client";
import { listAdminCategories, type AdminCategoryNode } from "@/lib/queries/admin-taxonomies";
import { cn } from "@/lib/utils";
import { ReorderButtons } from "@/components/admin/taxonomies/reorder-buttons";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string; deleted?: string }>;

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const tree = await listAdminCategories();
  const flat = flatten(tree);

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Organise</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            Categories
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            The shelves of the shop. Products can belong to more than one
            category. The order here determines the order in the main menu.
          </p>
        </div>
        <Link
          href="/admin/categories/new"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-4 w-4" />
          New category
        </Link>
      </header>

      {sp.saved && <Banner tone="ok">Category saved.</Banner>}
      {sp.deleted && <Banner tone="ok">Category deleted.</Banner>}

      <div className="mt-10 border border-ink/10 bg-white/60">
        {flat.length === 0 ? (
          <EmptyState />
        ) : (
          <ul>
            {flat.map(({ node, depth, siblings, position }) => (
              <li
                key={node.id}
                className={cn(
                  "grid grid-cols-[1fr_auto] items-center gap-4 border-b border-ink/5 px-4 py-3 last:border-0 hover:bg-ink/[0.02]",
                  !node.isActive && "opacity-60",
                )}
              >
                <div className="flex items-center gap-3">
                  {depth > 0 && (
                    <span
                      aria-hidden
                      className="text-ink-mid/40"
                      style={{ marginLeft: depth * 20 }}
                    >
                      ↳
                    </span>
                  )}
                  {node.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={node.iconUrl}
                      alt=""
                      className="h-8 w-8 border border-ink/10 bg-white object-contain"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center border border-ink/10 bg-white text-ink-mid">
                      <FolderTree className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <Link
                      href={`/admin/categories/${node.id}`}
                      className="block truncate font-display text-[15px] text-ink hover:underline"
                    >
                      {node.translations[Locale.EN].name || "(untitled)"}
                    </Link>
                    <div className="truncate text-[11px] text-ink-mid">
                      /{node.slug} · {node.productCount} product
                      {node.productCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <ReorderButtons
                    id={node.id}
                    isFirst={position === 0}
                    isLast={position === siblings - 1}
                  />
                  {node.isActive ? (
                    <span className="inline-flex items-center gap-1 bg-sage/15 px-2 py-0.5 text-[10px] uppercase tracking-label text-sage">
                      <CheckCircle2 className="h-3 w-3" /> Live
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-ink/5 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                      Hidden
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ──────── tree flatten ──────────────────────────────────────────────────

type FlatRow = {
  node: AdminCategoryNode;
  depth: number;
  siblings: number;
  position: number;
};

function flatten(tree: AdminCategoryNode[], depth = 0): FlatRow[] {
  const out: FlatRow[] = [];
  tree.forEach((node, i) => {
    out.push({ node, depth, siblings: tree.length, position: i });
    if (node.children.length > 0) {
      out.push(...flatten(node.children, depth + 1));
    }
  });
  return out;
}

// ──────── ui bits ───────────────────────────────────────────────────────

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-6 inline-flex items-center gap-2 border px-3 py-2 text-[12px]",
        tone === "ok"
          ? "border-sage/30 bg-sage/5 text-sage"
          : "border-vermilion/30 bg-vermilion/5 text-vermilion",
      )}
      role="status"
    >
      <CheckCircle2 className="h-4 w-4" />
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <FolderTree className="h-8 w-8 text-ink-mid" />
      <div className="mt-3 font-display text-[20px] text-ink">
        No categories yet
      </div>
      <p className="mt-2 max-w-sm text-[13px] text-ink-mid">
        Start with a handful of broad categories like "Cleanse" or "Treat",
        then nest finer ones underneath.
      </p>
      <Link
        href="/admin/categories/new"
        className="mt-6 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
      >
        <Plus className="h-4 w-4" />
        New category
      </Link>
      <p className="mt-6 inline-flex items-center gap-2 text-[11px] text-ink-mid">
        <Trash2 className="h-3 w-3" />
        Deleting a parent re-parents its children to the root.
      </p>
    </div>
  );
}
