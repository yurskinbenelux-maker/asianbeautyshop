// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/instagram — list + create form for the curated
// Instagram polaroid wall on the homepage.
//
// Sofia's flow: open this page → see existing tiles → "Add a post"
// at the bottom → pick an image from the library (or upload one in
// /admin/media first) → paste the IG post URL → save. The homepage
// auto-revalidates.
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Trash2 } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { getAllInstagramPosts } from "@/lib/queries/instagram";
import { listMediaForPicker } from "@/lib/queries/admin-banners";
import { InstagramPostForm } from "@/components/admin/marketing/instagram-post-form";
import {
  createInstagramPost,
  deleteInstagramPost,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string; deleted?: string }>;

export default async function AdminInstagramPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapability("homepage.edit", "/admin");
  const sp = await searchParams;
  const [posts, mediaLibrary] = await Promise.all([
    getAllInstagramPosts(),
    listMediaForPicker(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <Link
        href="/admin/marketing"
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to marketing
      </Link>

      <header className="mt-4 mb-10 max-w-3xl">
        <div className="eyebrow">Marketing</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Instagram showcase
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          The polaroid wall below the journal on the homepage. Each
          tile shows your image; clicking it opens the actual
          Instagram post in a new tab. Six tiles render on desktop —
          extra tiles are kept hidden for later.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
          <span className="font-medium text-ink">Note —</span> live
          Instagram embeds always look like stranded social widgets,
          so we use uploaded thumbnails instead (this is what every
          premium beauty brand does). Take a screenshot of your IG
          post or use any branded image — it just needs to look good
          at portrait 4:5.
        </p>
      </header>

      {sp.saved === "1" && <Banner>Saved.</Banner>}
      {sp.deleted === "1" && <Banner>Removed.</Banner>}

      {/* ── Existing posts ────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="font-display text-[18px] text-ink">
          Current posts ({posts.length})
        </h2>
        {posts.length === 0 ? (
          <p className="mt-4 text-[13px] text-ink-mid">
            No tiles yet. Add your first below.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3">
            {posts.map((p) => {
              const hasImage = !!p.imageUrl?.trim();
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-4 border border-ink/10 bg-white/60 p-3"
                >
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden bg-ink/5">
                    {hasImage ? (
                      <Image
                        src={p.imageUrl as string}
                        alt={p.imageAlt ?? ""}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] uppercase tracking-label text-vermilion">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-[12px] text-ink">
                      <span className="font-mono text-[11px] text-ink-mid">
                        #{p.sortOrder}
                      </span>
                      {p.isActive && hasImage ? (
                        <span className="inline-flex items-center gap-1 border border-sage/40 px-1.5 py-px text-[10px] uppercase tracking-label text-sage">
                          Active
                        </span>
                      ) : !hasImage ? (
                        <span className="inline-flex items-center gap-1 border border-vermilion/40 px-1.5 py-px text-[10px] uppercase tracking-label text-vermilion">
                          Hidden — needs image
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 border border-ink/15 px-1.5 py-px text-[10px] uppercase tracking-label text-ink-mid">
                          Hidden
                        </span>
                      )}
                    </div>
                    <a
                      href={p.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] text-ink-mid hover:text-vermilion"
                    >
                      {p.postUrl.replace(/^https?:\/\/(www\.)?/, "")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {p.caption && (
                      <p className="line-clamp-1 text-[12px] text-ink-mid">
                        {p.caption}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Link
                      href={`/admin/marketing/instagram/${p.id}`}
                      className="border border-ink/15 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink hover:border-ink"
                    >
                      Edit
                    </Link>
                    <form action={deleteInstagramPost}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 border border-vermilion/30 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-vermilion hover:border-vermilion"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Add new post ──────────────────────────────────────── */}
      <section className="border-t border-ink/10 pt-10">
        <h2 className="font-display text-[18px] text-ink">Add a post</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
          Pick a thumbnail from your media library (or upload one in{" "}
          <Link
            href="/admin/media"
            className="text-ink underline decoration-vermilion underline-offset-2"
          >
            /admin/media
          </Link>{" "}
          first), then paste the post URL.
        </p>
        <InstagramPostForm
          mode="create"
          action={createInstagramPost}
          mediaLibrary={mediaLibrary}
        />
      </section>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-8 inline-flex items-center gap-2 border border-sage/40 bg-sage/10 px-3 py-2 text-[12px] text-sage">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}
