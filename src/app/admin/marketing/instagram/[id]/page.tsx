// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/instagram/[id] — edit a single Instagram tile.
// Reuses the shared <InstagramPostForm> client component so the
// create + edit experiences are identical (MediaPicker on top,
// fields below). Delete lives on the list page.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { listMediaForPicker } from "@/lib/queries/admin-banners";
import { InstagramPostForm } from "@/components/admin/marketing/instagram-post-form";
import { updateInstagramPost } from "../actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditInstagramPostPage({ params }: Props) {
  await requireCapability("homepage.edit", "/admin");
  const { id } = await params;
  const [post, mediaLibrary] = await Promise.all([
    prisma.instagramPost.findUnique({ where: { id } }),
    listMediaForPicker(),
  ]);
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/admin/marketing/instagram"
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Instagram showcase
      </Link>

      <header className="mt-4 mb-10">
        <div className="eyebrow">Marketing · Instagram</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Edit tile
        </h1>
        <p className="mt-2 text-[12px] text-ink-mid">
          Created {post.createdAt.toLocaleDateString()} · Updated{" "}
          {post.updatedAt.toLocaleDateString()}
        </p>
      </header>

      <InstagramPostForm
        mode="edit"
        action={updateInstagramPost}
        mediaLibrary={mediaLibrary}
        defaultValues={{
          id: post.id,
          postUrl: post.postUrl,
          imageUrl: post.imageUrl ?? "",
          imageAlt: post.imageAlt ?? "",
          caption: post.caption ?? "",
          sortOrder: post.sortOrder,
          isActive: post.isActive,
        }}
      />
    </div>
  );
}
