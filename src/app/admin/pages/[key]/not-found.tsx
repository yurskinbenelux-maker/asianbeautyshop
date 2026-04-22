import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-20 text-center">
      <div className="eyebrow">Not found</div>
      <h1 className="mt-2 font-display text-[28px] text-ink">
        That page no longer exists.
      </h1>
      <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-mid">
        It may have been deleted. Head back to the list and pick another.
      </p>
      <Link
        href="/admin/pages"
        className="mt-6 inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to pages
      </Link>
    </div>
  );
}
