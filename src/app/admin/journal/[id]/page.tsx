import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAdminJournalPost } from "@/lib/queries/admin-journal";
import { JournalForm } from "@/components/admin/journal/journal-form";
import { JournalDangerZone } from "@/components/admin/journal/journal-danger-zone";

export const dynamic = "force-dynamic";

export default async function EditJournalPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getAdminJournalPost(id);
  if (!post) notFound();

  const englishTitle = post.translations.EN.title || "Untitled post";

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/admin/journal"
        className="inline-flex items-center gap-1 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Journal
      </Link>
      <header className="mt-6 mb-10">
        <div className="eyebrow">Edit post</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          {englishTitle}
        </h1>
      </header>

      <JournalForm
        mode="edit"
        initial={{
          id: post.id,
          status: post.status,
          publishedAt: post.publishedAt,
          coverUrl: post.coverUrl,
          heroUrl: post.heroUrl,
          authorName: post.authorName,
          translations: post.translations,
        }}
      />

      <div className="mt-12">
        <JournalDangerZone id={post.id} />
      </div>
    </div>
  );
}
