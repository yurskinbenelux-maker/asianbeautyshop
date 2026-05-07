// ─────────────────────────────────────────────────────────────────────────
// /admin/products/import — bulk CSV import.
//
// Server shell: guards the route, renders the client UI. The actual
// upload/preview/commit flow is driven by the client component so we
// can give an admin rich feedback (preview tables, warnings, per-row
// errors) without full-page reloads between each step.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowLeft, DownloadCloud } from "lucide-react";

import { requireAdmin } from "@/lib/auth";
import { ProductImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import products · Admin",
};

export default async function ProductImportPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      {/* breadcrumb */}
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Products
      </Link>

      {/* masthead */}
      <header className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Catalogue</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            Import from CSV
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            Upload a catalogue spreadsheet to create or update many products
            at once. The SKU column is the unique key — rows with a new SKU
            are created, existing SKUs are updated. Images stay managed in
            the per-product editor.
          </p>
        </div>

        <a
          href="/admin/products/import/template"
          className="inline-flex items-center gap-2 border border-ink/15 bg-white/60 px-4 py-2 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-white"
        >
          <DownloadCloud className="h-4 w-4" aria-hidden />
          Download template
        </a>
      </header>

      {/* import flow */}
      <div className="mt-10 border-t border-ink/10 pt-10">
        <ProductImportClient />
      </div>

      {/* reference */}
      <aside className="mt-12 border border-ink/10 bg-white/40 p-6">
        <div className="eyebrow">Field notes</div>
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-[13px] text-ink-mid md:grid-cols-2">
          <Row term="sku">
            Required and unique. Used as the upsert key.
          </Row>
          <Row term="status">
            DRAFT (default), PUBLISHED, or ARCHIVED. Blank becomes DRAFT.
          </Row>
          <Row term="name_en / description_en">
            English is the fallback locale and required. NL/FR/RU are
            optional per row — leave blank to keep any existing translation.
          </Row>
          <Row term="price_eur">
            Required. Accepts either &quot;24.90&quot; or &quot;24,90&quot;.
          </Row>
          <Row term="brand_slug">
            Must match an existing brand slug. Unknown slugs become a
            warning and the brand is cleared on the product.
          </Row>
          <Row term="category_slugs · ingredient_slugs · …">
            Semicolon-separated slugs of existing taxonomy rows.
            Unknown slugs are skipped with a warning.
          </Row>
        </dl>
      </aside>
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[12px] text-ink">{term}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
