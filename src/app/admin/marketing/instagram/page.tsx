// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/instagram — list + create form for the curated
// Instagram grid that surfaces below the journal teaser on the
// homepage. Sofia adds posts (image + post URL + alt text + sortOrder).
// Editing happens in /admin/marketing/instagram/[id].
// ─────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Trash2 } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { getAllInstagramPosts } from "@/lib/queries/instagram";
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
  const posts = await getAllInstagramPosts();

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
          The curated Instagram grid below the journal on the homepage.
          Add the post URL (so the tile clicks through to the real
          post) plus the image you want to show. Six tiles render on
          desktop. Hidden tiles are kept for later.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
          <span className="font-medium text-ink">Tip —</span> upload
          your image to{" "}
          <Link
            href="/admin/media"
            className="text-ink underline decoration-vermilion underline-offset-2"
          >
            /admin/media
          </Link>{" "}
          first, then paste the URL here.
        </p>
      </header>

      {sp.saved === "1" && (
        <Banner kind="ok">Saved.</Banner>
      )}
      {sp.deleted === "1" && (
        <Banner kind="ok">Removed.</Banner>
      )}

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
            {posts.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-4 border border-ink/10 bg-white/60 p-3"
              >
                <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden bg-ink/5">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.imageAlt ?? ""}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-label text-ink-mid">
                      Embed
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 text-[12px] text-ink">
                    <span className="font-mono text-[11px] text-ink-mid">
                      #{p.sortOrder}
                    </span>
                    {p.isActive ? (
                      <span className="inline-flex items-center gap-1 border border-sage/40 px-1.5 py-px text-[10px] uppercase tracking-label text-sage">
                        Active
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
            ))}
          </ul>
        )}
      </section>

      {/* ── Add new post ──────────────────────────────────────── */}
      <section className="border-t border-ink/10 pt-10">
        <h2 className="font-display text-[18px] text-ink">Add a post</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
          Just paste the Instagram post URL — the homepage will embed
          the live post (image or video) automatically.
        </p>
        <form action={createInstagramPost} className="mt-5 space-y-4">
          <Field
            label="Instagram post URL"
            name="postUrl"
            placeholder="https://www.instagram.com/p/XXXXXXXX/  (or /reel/, /tv/)"
            required
            hint="The post the tile embeds + opens on click."
          />
          <Field
            label="Image URL — override (optional)"
            name="imageUrl"
            placeholder="https://…/custom-thumbnail.jpg"
            hint="Leave blank to use the live Instagram embed (recommended). Only set this if you want a branded thumbnail instead."
          />
          <Field
            label="Alt text (only used when image override is set)"
            name="imageAlt"
            placeholder="A close-up of the YU.R essence on a marble shelf"
            hint="Helps screen readers + SEO."
          />
          <Field
            label="Caption overlay (optional)"
            name="caption"
            placeholder="Short overlay shown on hover"
            hint="Leave blank to show the image only."
            maxLength={300}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Sort order"
              name="sortOrder"
              type="number"
              defaultValue="0"
              required
              hint="Lower numbers come first."
            />
            <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked
                className="h-4 w-4 border-ink/20 text-ink focus:ring-ink"
              />
              <span>Show on the homepage</span>
            </label>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-2.5 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
          >
            Add post
          </button>
        </form>
      </section>
    </div>
  );
}

function Banner({ kind, children }: { kind: "ok"; children: React.ReactNode }) {
  return (
    <div
      className={
        "mb-8 inline-flex items-center gap-2 border border-sage/40 bg-sage/10 px-3 py-2 text-[12px] " +
        (kind === "ok" ? "text-sage" : "text-vermilion")
      }
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
  required,
  type = "text",
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
      />
      {hint && (
        <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
          {hint}
        </span>
      )}
    </label>
  );
}
