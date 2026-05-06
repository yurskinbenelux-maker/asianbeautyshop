// ─────────────────────────────────────────────────────────────────────────
// /admin/marketing/instagram/[id] — edit a single Instagram tile.
// Same fields as the create form, pre-filled. Delete lives on the
// list page so this stays a single-purpose editor.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { updateInstagramPost } from "../actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditInstagramPostPage({ params }: Props) {
  await requireCapability("homepage.edit", "/admin");
  const { id } = await params;
  const post = await prisma.instagramPost.findUnique({ where: { id } });
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
      </header>

      {/* ── Preview ──────────────────────────────────────────── */}
      <div className="mb-10 flex items-start gap-5">
        <div className="relative h-32 w-32 flex-shrink-0 overflow-hidden border border-ink/10 bg-ink/5">
          <Image
            src={post.imageUrl}
            alt={post.imageAlt ?? ""}
            fill
            sizes="128px"
            className="object-cover"
          />
        </div>
        <div className="space-y-1 text-[12px] text-ink-mid">
          <p>Created {post.createdAt.toLocaleDateString()}</p>
          <p>Updated {post.updatedAt.toLocaleDateString()}</p>
        </div>
      </div>

      <form action={updateInstagramPost} className="space-y-4">
        <input type="hidden" name="id" value={post.id} />
        <Field
          label="Image URL"
          name="imageUrl"
          defaultValue={post.imageUrl}
          required
        />
        <Field
          label="Alt text"
          name="imageAlt"
          defaultValue={post.imageAlt ?? ""}
          hint="Describe the image — helps screen readers + SEO."
        />
        <Field
          label="Instagram post URL"
          name="postUrl"
          defaultValue={post.postUrl}
          required
        />
        <Field
          label="Caption overlay"
          name="caption"
          defaultValue={post.caption ?? ""}
          hint="Optional. Shown on hover."
          maxLength={300}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Sort order"
            name="sortOrder"
            type="number"
            defaultValue={String(post.sortOrder)}
            required
          />
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={post.isActive}
              className="h-4 w-4 border-ink/20 text-ink focus:ring-ink"
            />
            <span>Show on the homepage</span>
          </label>
        </div>
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
