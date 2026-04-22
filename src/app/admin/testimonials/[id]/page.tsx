// ─────────────────────────────────────────────────────────────────────────
// /admin/testimonials/[id] — edit a single testimonial.
//
// Includes an inline delete form at the bottom. Delete is destructive and
// cascades the translations, so we confirm with a native browser prompt.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Locale } from "@prisma/client";
import { getAdminTestimonial } from "@/lib/queries/admin-testimonials";
import {
  TestimonialForm,
  type TestimonialFormValues,
} from "@/components/admin/testimonials/testimonial-form";
import { deleteTestimonialAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditTestimonialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getAdminTestimonial(id);
  if (!row) notFound();

  // Shape from query → shape the form wants. The query already returns
  // null per locale if there's no row for that language, which is exactly
  // what the form expects.
  const values: TestimonialFormValues = {
    id: row.id,
    rating: row.rating,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    verified: row.verified,
    translations: {
      [Locale.EN]: row.translations.EN,
      [Locale.NL]: row.translations.NL,
      [Locale.FR]: row.translations.FR,
      [Locale.RU]: row.translations.RU,
    },
  };

  const preview = row.translations.EN?.quote ?? "(no English quote yet)";

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <Link
        href="/admin/testimonials"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Testimonials
      </Link>

      <header className="mb-10 mt-6">
        <div className="eyebrow">Edit testimonial</div>
        <h1 className="mt-2 max-w-3xl font-display text-[26px] leading-tight text-ink">
          {preview}
        </h1>
        <p className="mt-2 font-mono text-[11px] tracking-label text-ink-mid">
          {row.id}
        </p>
      </header>

      <TestimonialForm mode="edit" values={values} />

      {/* ── danger zone ───────────────────────────────────────── */}
      <div className="mt-16 border-t border-ink/10 pt-8">
        <h2 className="font-display text-[18px] text-ink">Danger zone</h2>
        <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-ink-mid">
          Deleting a testimonial removes every language. You can also just
          toggle &ldquo;Active&rdquo; off above to hide it without losing the
          content.
        </p>
        <form action={deleteTestimonialAction} className="mt-4">
          <input type="hidden" name="id" value={row.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-vermilion/40 px-4 py-2 text-[12px] uppercase tracking-label text-vermilion hover:border-vermilion hover:bg-vermilion/5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete testimonial
          </button>
        </form>
      </div>
    </div>
  );
}
