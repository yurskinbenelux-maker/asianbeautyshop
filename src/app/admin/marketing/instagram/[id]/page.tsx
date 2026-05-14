// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/instagram/[id] — single-post sort-order editor.
//
// As of the Graph API rewrite, captions / images / permalinks come
// from Meta and would be overwritten on the next sync, so they're
// not editable here. The only thing an admin can tweak per-post is
// the sort order (to pin a particular post on top of the homepage
// row). Visibility toggle lives on the list page for one-click access.
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { requireCapability } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { isVideoPost, thumbnailFor } from "@/lib/queries/instagram";
import { updateInstagramTile } from "../actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditInstagramPostPage({ params }: Props) {
  await requireCapability("homepage.edit", "/admin");
  const { id } = await params;
  const post = await prisma.instagramPost.findUnique({ where: { id } });
  if (!post) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
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
          Posted {post.postedAt.toLocaleDateString()} · Last synced{" "}
          {post.lastSyncedAt.toLocaleDateString()}
        </p>
      </header>

      {/* Preview + read-only metadata */}
      <div className="mb-8 flex flex-col gap-6 md:flex-row">
        <div className="relative aspect-[4/5] w-full max-w-[200px] overflow-hidden border border-ink/10 bg-ink/5">
          <Image
            src={thumbnailFor(post)}
            alt={post.caption?.slice(0, 80) ?? "Instagram post"}
            fill
            sizes="200px"
            unoptimized
            className="object-cover"
          />
          {isVideoPost(post) && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 border border-ink/15 bg-white/90 px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
              Video
            </span>
          )}
        </div>
        <div className="flex-1 space-y-3 text-[13px]">
          <div>
            <div className="text-[10px] uppercase tracking-label text-ink-mid">
              Caption
            </div>
            <p className="mt-1 whitespace-pre-line text-ink">
              {post.caption || (
                <span className="italic text-ink-mid">No caption</span>
              )}
            </p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-label text-ink-mid">
              Permalink
            </div>
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-ink hover:text-vermilion"
            >
              {post.permalink.replace(/^https?:\/\/(www\.)?/, "")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-label text-ink-mid">
              Media type
            </div>
            <p className="mt-1 font-mono text-[12px] text-ink">{post.mediaType}</p>
          </div>
        </div>
      </div>

      <p className="mb-6 rounded border border-gold/30 bg-gold/5 p-3 text-[12px] leading-relaxed text-ink-mid">
        Caption + image come from Instagram and would be overwritten on
        the next sync — only the sort order &amp; visibility flag below
        are editable here.
      </p>

      <form action={updateInstagramTile} className="space-y-4">
        <input type="hidden" name="id" value={post.id} />
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
            Sort order
          </span>
          <input
            type="number"
            name="sortOrder"
            defaultValue={post.sortOrder}
            required
            min={0}
            max={9999}
            className="w-32 border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink focus:border-ink focus:outline-none"
          />
          <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
            Lower numbers come first. Use this to pin a hero post on top.
          </span>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            name="isVisible"
            defaultChecked={post.isVisible}
            className="h-4 w-4 border-ink/20 text-ink focus:ring-ink"
          />
          <span>Show on the homepage</span>
        </label>
        <div className="border-t border-ink/10 pt-6">
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-2.5 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
          >
            Save tile
          </button>
        </div>
      </form>
    </div>
  );
}
