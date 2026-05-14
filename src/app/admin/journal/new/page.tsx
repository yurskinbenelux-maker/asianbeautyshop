import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { JournalForm } from "@/components/admin/journal/journal-form";

export const dynamic = "force-dynamic";

export default function NewJournalPostPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/admin/journal"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Journal
      </Link>
      <header className="mt-6 mb-10">
        <div className="eyebrow">New post</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Write a journal entry
        </h1>
        <p className="mt-2 max-w-xl text-[13px] text-ink-mid">
          Start with the English title — the other languages can stay blank and
          will fall back to English on the public site.
        </p>
      </header>
      <JournalForm mode="create" />
    </div>
  );
}
