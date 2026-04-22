import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageForm } from "@/components/admin/pages/page-form";

export const dynamic = "force-dynamic";

export default function NewPagePage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/admin/pages"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Pages
      </Link>
      <header className="mt-6 mb-10">
        <div className="eyebrow">New page</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Create a static page
        </h1>
        <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
          Pick a short URL key (e.g. "about", "faq") and write the English copy.
          The other languages can fall back to English if blank.
        </p>
      </header>
      <PageForm mode="create" />
    </div>
  );
}
