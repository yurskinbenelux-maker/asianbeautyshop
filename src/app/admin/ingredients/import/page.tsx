// ─────────────────────────────────────────────────────────────────────────
// /admin/ingredients/import — bulk CSV import.
//
// Mirrors /admin/products/import. Server shell guards the route, the
// client component drives the upload → preview → commit flow.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowLeft, DownloadCloud } from "lucide-react";

import { requireAdmin } from "@/lib/auth";
import { IngredientImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import ingredients · Admin",
};

export default async function IngredientImportPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12">
      {/* breadcrumb */}
      <Link
        href="/admin/ingredients"
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-label text-ink-mid transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Ingredients
      </Link>

      {/* masthead */}
      <header className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">Library</div>
          <h1 className="mt-2 font-display text-[34px] leading-tight text-ink">
            Import from CSV
          </h1>
          <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
            Upload an ingredient spreadsheet to create or update many
            entries at once. The <code>slug</code> column is the unique
            key — rows with a new slug are created, existing slugs are
            updated. Empty translation cells are left untouched (you
            won't accidentally erase a locale by importing a partial CSV).
          </p>
        </div>

        <a
          href="/admin/ingredients/import/template"
          className="inline-flex items-center gap-2 border border-ink/15 bg-white/60 px-4 py-2 text-[12px] uppercase tracking-label text-ink transition-colors hover:border-ink hover:bg-white"
        >
          <DownloadCloud className="h-4 w-4" aria-hidden />
          Download template
        </a>
      </header>

      {/* import flow */}
      <div className="mt-10 border-t border-ink/10 pt-10">
        <IngredientImportClient />
      </div>

      {/* reference */}
      <aside className="mt-12 border border-ink/10 bg-white/40 p-6">
        <div className="eyebrow">Field notes</div>
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-[13px] text-ink-mid md:grid-cols-2">
          <Row term="slug">
            Required and unique. Lowercase + hyphens. Used as the upsert
            key and in the URL <code>/ingredients/[slug]</code>.
          </Row>
          <Row term="inci_name">
            Required. The scientific name as it appears on the supplier
            sticker (e.g. <em>Centella Asiatica Extract</em>).
          </Row>
          <Row term="is_key_asset · is_allergen">
            <code>true</code> / <code>false</code>. Default <code>false</code>{" "}
            if blank. Key assets surface as cards on the public
            /ingredients page and on product details.
          </Row>
          <Row term="display_name_en / display_name_nl / fr / ru">
            What customers see — usually friendlier than INCI{" "}
            (<em>Centella</em> instead of{" "}
            <em>Centella Asiatica Extract</em>). Blank locale falls back
            to EN, then to <code>inci_name</code> on the public site.
          </Row>
          <Row term="description_en / nl / fr / ru">
            Rich text. HTML allowed (<code>&lt;p&gt;</code>,{" "}
            <code>&lt;strong&gt;</code>…). This is the long-form copy
            shown on /ingredients/[slug] and in the product breakdown.
          </Row>
          <Row term="Empty cells">
            Empty translation cells <strong>do not</strong> wipe
            existing data — they're treated as "leave untouched". Type a
            single space if you want to clear a value (rare).
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
