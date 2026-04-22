// ─────────────────────────────────────────────────────────────────────────
// /admin/categories/brands — list of brands.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Plus, CheckCircle2, Store } from "lucide-react";
import { listAdminBrands } from "@/lib/queries/admin-taxonomies";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string; deleted?: string }>;

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const brands = await listAdminBrands();

  return (
    <div className="mx-auto max-w-7xl px-8 py-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Organise</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            Brands
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            Korean houses carried on the shop. Each brand can have a tagline
            and a longer story per language, shown on the brand landing.
          </p>
        </div>
        <Link
          href="/admin/categories/brands/new"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          <Plus className="h-4 w-4" />
          New brand
        </Link>
      </header>

      {sp.saved && (
        <p className="mt-6 inline-flex items-center gap-2 border border-sage/30 bg-sage/5 px-3 py-2 text-[12px] text-sage">
          <CheckCircle2 className="h-4 w-4" />
          Brand saved.
        </p>
      )}
      {sp.deleted && (
        <p className="mt-6 inline-flex items-center gap-2 border border-sage/30 bg-sage/5 px-3 py-2 text-[12px] text-sage">
          <CheckCircle2 className="h-4 w-4" />
          Brand deleted.
        </p>
      )}

      <div className="mt-10 border border-ink/10 bg-white/60">
        {brands.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <Store className="h-8 w-8 text-ink-mid" />
            <div className="mt-3 font-display text-[20px] text-ink">
              No brands yet
            </div>
            <p className="mt-2 max-w-sm text-[13px] text-ink-mid">
              Add the K-beauty houses you're stocking. Products point at a
              brand from their edit page.
            </p>
          </div>
        ) : (
          <ul>
            {brands.map((b) => (
              <li
                key={b.id}
                className={cn(
                  "grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-ink/5 px-4 py-3 last:border-0 hover:bg-ink/[0.02]",
                  !b.isActive && "opacity-60",
                )}
              >
                {b.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.logoUrl}
                    alt=""
                    className="h-10 w-10 border border-ink/10 bg-white object-contain"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center border border-ink/10 bg-white text-ink-mid">
                    <Store className="h-4 w-4" />
                  </span>
                )}
                <Link
                  href={`/admin/categories/brands/${b.id}`}
                  className="min-w-0 hover:underline"
                >
                  <div className="truncate font-display text-[15px] text-ink">
                    {b.name}
                  </div>
                  <div className="truncate text-[11px] text-ink-mid">
                    /{b.slug} · {b.productCount} product
                    {b.productCount === 1 ? "" : "s"}
                  </div>
                </Link>
                {b.isActive ? (
                  <span className="inline-flex items-center gap-1 bg-sage/15 px-2 py-0.5 text-[10px] uppercase tracking-label text-sage">
                    <CheckCircle2 className="h-3 w-3" /> Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-ink/5 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
                    Hidden
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
