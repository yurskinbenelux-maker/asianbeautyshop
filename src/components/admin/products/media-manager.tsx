// ─────────────────────────────────────────────────────────────────────────
// MediaManager — the Media tab of the product editor.
//
// Layout: big drop-zone at the top, then a grid of existing media tiles.
// Each tile shows: thumbnail, "PRIMARY" badge, up/down arrows, star
// (make primary), trash (delete). All mutations go through Server Actions
// declared in @/app/admin/products/actions.ts; revalidatePath() inside
// those actions re-runs this page's server data, so after any action the
// grid reflects the new order immediately.
//
// File picker: drag-and-drop OR click-to-browse. Drops multiple files
// sequentially — one FormData per file — so the 10 MB body limit applies
// per file, not per batch.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteProductMedia,
  moveProductMedia,
  setPrimaryMedia,
  uploadProductMedia,
} from "@/app/admin/products/actions";
import {
  updateMediaAltAction,
  type ActionState,
} from "@/app/admin/media/actions";

export type MediaRow = {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export function MediaManager({
  productId,
  media,
}: {
  productId: string;
  media: MediaRow[];
}) {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueDone, setQueueDone] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Uploads n files sequentially — more predictable than Promise.all
  // (progress visible, one error doesn't cancel the rest).
  async function handleFiles(files: File[]) {
    if (files.length === 0) return;

    startUpload(async () => {
      setUploadError(null);
      setQueueTotal(files.length);
      setQueueDone(0);

      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const result = await uploadProductMedia(productId, { ok: true }, fd);
        if (!result.ok && result.message) {
          setUploadError(result.message);
        }
        setQueueDone((n) => n + 1);
      }

      setQueueTotal(0);
      setQueueDone(0);
      // Refresh server component so the grid picks up the new rows.
      router.refresh();
    });
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    handleFiles(files);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    handleFiles(files);
    // reset so picking the same filename twice still triggers onChange
    e.target.value = "";
  }

  const sorted = [...media].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-8">
      {/* drop-zone */}
      <label
        htmlFor="admin-media-upload"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-12 text-center transition-colors",
          isDragging
            ? "border-ink bg-ink/5"
            : "border-ink/15 bg-white/60 hover:border-ink/30",
          isUploading && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud className="h-8 w-8 text-ink-mid" />
        <div className="mt-3 text-[14px] text-ink">
          {isUploading
            ? `Uploading… ${queueDone}/${queueTotal}`
            : "Drop images here, or click to browse"}
        </div>
        <div className="mt-1 text-[11px] text-ink-mid">
          JPG, PNG, WEBP or AVIF · up to 8 MB each
        </div>
        <input
          ref={inputRef}
          id="admin-media-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="sr-only"
          onChange={onPick}
          disabled={isUploading}
        />
      </label>

      {uploadError && (
        <p className="text-[12px] text-vermilion">{uploadError}</p>
      )}

      {/* grid */}
      {sorted.length === 0 ? (
        <div className="border border-dashed border-ink/15 bg-white/40 px-6 py-12 text-center">
          <div className="text-[13px] text-ink-mid">
            No images yet. The first one you upload becomes the primary image
            automatically.
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-[16px] text-ink">
              {sorted.length} image{sorted.length === 1 ? "" : "s"}
            </h3>
            <p className="text-[11px] text-ink-mid">
              The primary image shows on the product card and as the hero on
              the product page.
            </p>
          </div>

          {/*
            Accessibility + SEO nudge. Empty alt is usually a bug — Google
            uses alt text for image search, and screen readers rely on it
            for blind customers. Show the count so it's easy to scan
            whether there's anything to fix.
          */}
          {sorted.some((m) => !m.alt || !m.alt.trim()) && (
            <div
              role="status"
              className="mb-3 flex items-start gap-2 border border-gold/30 bg-gold/5 px-3 py-2 text-[12px] text-ink"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              <p>
                {sorted.filter((m) => !m.alt || !m.alt.trim()).length} image
                {sorted.filter((m) => !m.alt || !m.alt.trim()).length === 1
                  ? ""
                  : "s"}{" "}
                need alt text. A short description of what the photo shows
                helps screen readers and improves how the product ranks in
                image search.
              </p>
            </div>
          )}

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((m, idx) => (
              <MediaTile
                key={m.id}
                media={m}
                position={idx}
                total={sorted.length}
                onChanged={() => router.refresh()}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ──────── single tile ───────────────────────────────────────────────────

function MediaTile({
  media,
  position,
  total,
  onChanged,
}: {
  media: MediaRow;
  position: number;
  total: number;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const call = (fn: () => Promise<void>) => {
    startTransition(async () => {
      await fn();
      onChanged();
    });
  };

  const isFirst = position === 0;
  const isLast = position === total - 1;
  const missingAlt = !media.alt || !media.alt.trim();

  return (
    <li
      className={cn(
        "relative border bg-white transition-colors",
        media.isPrimary ? "border-ink" : "border-ink/10",
        pending && "opacity-60",
      )}
    >
      {/* thumbnail */}
      <div className="relative aspect-square overflow-hidden bg-rice-dim">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.url}
          alt={media.alt ?? ""}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {media.isPrimary && (
          <span className="absolute left-2 top-2 bg-ink px-2 py-0.5 text-[10px] uppercase tracking-label text-white">
            Primary
          </span>
        )}
        {missingAlt && (
          <span
            title="No alt text — please add a short description"
            className="absolute right-2 top-2 inline-flex items-center gap-1 border border-gold/40 bg-gold/90 px-1.5 py-0.5 text-[10px] uppercase tracking-label text-white"
          >
            <AlertCircle className="h-2.5 w-2.5" />
            Alt
          </span>
        )}
      </div>

      {/*
        Inline alt-text editor. Sofia edits and hits Save; no auto-save so a
        stray keystroke can't silently wipe the field. Reuses the existing
        updateMediaAltAction from /admin/media — Media rows are a shared
        concept, not a product-specific one.
      */}
      <AltEditor mediaId={media.id} initial={media.alt ?? ""} onSaved={onChanged} />

      {/* controls */}
      <div className="flex items-center justify-between border-t border-ink/10 px-3 py-2">
        <div className="flex items-center gap-1">
          <IconButton
            label="Move up"
            disabled={isFirst || pending}
            onClick={() => call(() => moveProductMedia(media.id, "up"))}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            label="Move down"
            disabled={isLast || pending}
            onClick={() => call(() => moveProductMedia(media.id, "down"))}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        <div className="flex items-center gap-1">
          <IconButton
            label={media.isPrimary ? "Already primary" : "Make primary"}
            disabled={media.isPrimary || pending}
            onClick={() => call(() => setPrimaryMedia(media.id))}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                media.isPrimary && "fill-ink text-ink",
              )}
            />
          </IconButton>
          <IconButton
            label="Delete image"
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  "Delete this image? This also removes it from Supabase Storage.",
                )
              ) {
                call(() => deleteProductMedia(media.id));
              }
            }}
            danger
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

// ──────── alt-text editor ───────────────────────────────────────────────

const ALT_INITIAL: ActionState = { ok: false };

function AltEditor({
  mediaId,
  initial,
  onSaved,
}: {
  mediaId: string;
  initial: string;
  onSaved: () => void;
}) {
  const [state, dispatch] = useActionState(updateMediaAltAction, ALT_INITIAL);
  // When the save succeeds, refresh the server data so the "missing alt"
  // count at the top of the panel drops without a full reload.
  useEffect(() => {
    if (state.ok) onSaved();
  }, [state.ok, onSaved]);

  return (
    <form action={dispatch} className="border-t border-ink/10 px-3 py-2">
      <input type="hidden" name="id" value={mediaId} />
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-label text-ink-mid">
          <span>Alt text</span>
          <span className="text-ink-mid/60">for accessibility + SEO</span>
        </span>
        <input
          name="alt"
          defaultValue={initial}
          maxLength={200}
          placeholder="e.g. Glass bottle of hydrating serum on a marble surface"
          className="w-full border border-ink/15 bg-white px-2 py-1.5 text-[12px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
        />
      </label>
      <div className="mt-2 flex items-center gap-2">
        <SaveAltButton />
        {state.message && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px]",
              state.ok ? "text-sage" : "text-vermilion",
            )}
          >
            {state.ok ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function SaveAltButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 border border-ink/20 bg-white px-2 py-1 text-[10px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      Save alt
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center border border-transparent transition-colors",
        danger
          ? "text-ink-mid hover:border-vermilion hover:text-vermilion"
          : "text-ink-mid hover:border-ink hover:text-ink",
        disabled && "cursor-not-allowed opacity-40 hover:border-transparent",
      )}
    >
      {children}
    </button>
  );
}
