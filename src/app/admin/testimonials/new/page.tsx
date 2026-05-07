// ─────────────────────────────────────────────────────────────────────────
// /admin/testimonials/new — new-testimonial form.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Locale } from "@prisma/client";
import { nextTestimonialSortOrder } from "@/lib/queries/admin-testimonials";
import {
  TestimonialForm,
  type TestimonialFormValues,
} from "@/components/admin/testimonials/testimonial-form";

export const dynamic = "force-dynamic";

export default async function NewTestimonialPage() {
  // Sensible defaults — rating 5, verified ON, active OFF. We default to
  // hidden so an admin can preview the row before flipping it live.
  const sortOrder = await nextTestimonialSortOrder();

  const values: TestimonialFormValues = {
    rating: 5,
    sortOrder,
    isActive: false,
    verified: true,
    translations: {
      [Locale.EN]: null,
      [Locale.NL]: null,
      [Locale.FR]: null,
      [Locale.RU]: null,
    },
  };

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
        <div className="eyebrow">New testimonial</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Add a customer voice
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-mid">
          Fill in at least the English quote and author. Other languages are
          optional — leave them blank and the card falls back to English on
          the public site.
        </p>
      </header>

      <TestimonialForm mode="create" values={values} />
    </div>
  );
}
