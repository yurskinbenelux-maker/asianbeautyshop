// ─────────────────────────────────────────────────────────────────────────
// MediaDrawer — right-side panel opened from a MediaCard. Shows a larger
// preview, full metadata, and the per-image actions: edit alt, copy URL,
// set primary, delete.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Crown,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  deleteMediaAction,
  setPrimaryMediaAction,
  updateMediaAltAction,
  type ActionState,
} from "@/app/admin/media/actions";
import type { AdminMediaRow } from "@/lib/queries/admin-media";

const INITIAL: ActionState = { ok: false };

export function MediaDrawer({
  media,
  onClose,
}: {
  media: AdminMediaRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [altState, altAction] = useActionState(updateMediaAltAction, INITIAL);
  const [primaryState, primaryAction] = useActionState(
    setPrimaryMediaAction,
    INITIAL,
  );
  const [deleteState, deleteAction] = useActionState(deleteMediaAction, INITIAL);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Close on Escape — nice keyboard parity with the cart drawer.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Refresh the list if a destructive/write action just succeeded.
  useEffect(() => {
    if (altState.ok || primaryState.ok) router.refresh();
  }, [altState.ok, primaryState.ok, router]);

  // Close after successful delete.
  useEffect(() => {
    if (deleteState.ok) {
      router.refresh();
      onClose();
    }
  }, [deleteState.ok, router, onClose]);

  const canSetPrimary = !!media.productId && !media.isPrimary;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={`Media details — ${media.alt || media.id}`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-ink/40 backdrop-blur-sm"
      />

      <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-ink/10 bg-rice shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-rice/90 px-6 py-4 backdrop-blur">
          <div>
            <div className="eyebrow">Media</div>
            <p className="mt-0.5 font-display text-[18px] text-ink">Details</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-ink/15 p-1.5 text-ink-mid hover:border-ink hover:text-ink"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-8 px-6 py-6">
          <div className="border border-ink/10 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media.url}
              alt={media.alt ?? ""}
              className="h-auto max-h-[60vh] w-full object-contain"
            />
          </div>

          {/* Alt text ------------------------------------------------------- */}
          <form action={altAction} className="space-y-2">
            <input type="hidden" name="id" value={media.id} />
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
                Alt text
              </span>
              <input
                name="alt"
                defaultValue={media.alt ?? ""}
                placeholder="Describe this image for screen readers + SEO"
                className="input"
                maxLength={200}
              />
            </label>
            <div className="flex items-center gap-3">
              <SaveAltButton />
              {altState.message && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px]",
                    altState.ok ? "text-sage" : "text-vermilion",
                  )}
                >
                  {altState.ok ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertCircle className="h-3 w-3" />
                  )}
                  {altState.message}
                </span>
              )}
            </div>
          </form>

          {/* URL ------------------------------------------------------------ */}
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-label text-ink-mid">
              Public URL
            </div>
            <div className="flex items-stretch gap-2">
              <code className="input flex-1 truncate bg-white font-mono text-[11px]">
                {media.url}
              </code>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(media.url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    // Clipboard API may be blocked; ignore.
                  }
                }}
                className="inline-flex items-center gap-1 border border-ink/15 bg-white px-3 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
              >
                <Copy className="h-3 w-3" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Linked product ------------------------------------------------ */}
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-label text-ink-mid">
              Link
            </div>
            {media.productId ? (
              <Link
                href={`/admin/products/${media.productId}`}
                className="inline-flex items-center gap-2 text-[13px] text-ink underline-offset-2 hover:underline"
              >
                {media.productName || "Open product"}
              </Link>
            ) : media.bannerCount > 0 ? (
              <p className="text-[13px] text-ink-mid">
                Used on {media.bannerCount} homepage banner
                {media.bannerCount === 1 ? "" : "s"}.
              </p>
            ) : (
              <p className="text-[13px] text-vermilion/80">
                Not linked anywhere. Safe to delete.
              </p>
            )}
          </div>

          {/* Set-primary action ------------------------------------------- */}
          {canSetPrimary && (
            <form action={primaryAction}>
              <input type="hidden" name="id" value={media.id} />
              <SetPrimaryButton />
              {primaryState.message && !primaryState.ok && (
                <span className="ml-3 inline-flex items-center gap-1 text-[11px] text-vermilion">
                  <AlertCircle className="h-3 w-3" />
                  {primaryState.message}
                </span>
              )}
            </form>
          )}

          {/* Delete --------------------------------------------------------- */}
          <div className="border-t border-ink/10 pt-6">
            <div className="eyebrow text-vermilion">Danger zone</div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="mt-3 inline-flex items-center gap-2 border border-vermilion/30 px-3 py-2 text-[11px] uppercase tracking-label text-vermilion hover:bg-vermilion hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete image
              </button>
            ) : (
              <form action={deleteAction} className="mt-3 space-y-3">
                <input type="hidden" name="id" value={media.id} />
                <p className="text-[12px] text-ink">
                  This removes the file from storage and the Media record.
                  Products that used this image will fall back to the next one.
                </p>
                <div className="flex items-center gap-2">
                  <DeleteButton />
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="border border-ink/15 px-3 py-2 text-[11px] uppercase tracking-label text-ink-mid hover:border-ink hover:text-ink"
                  >
                    Cancel
                  </button>
                  {deleteState.message && !deleteState.ok && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-vermilion">
                      <AlertCircle className="h-3 w-3" />
                      {deleteState.message}
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function SaveAltButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      Save alt
    </button>
  );
}

function SetPrimaryButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-gold/40 bg-gold/10 px-3 py-1.5 text-[11px] uppercase tracking-label text-gold hover:bg-gold hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Crown className="h-3 w-3" />
      )}
      Make primary image
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 border border-vermilion bg-vermilion px-3 py-2 text-[11px] uppercase tracking-label text-white hover:bg-vermilion/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Trash2 className="h-3 w-3" />
      )}
      Delete
    </button>
  );
}
