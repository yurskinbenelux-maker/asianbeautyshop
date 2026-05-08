// ─────────────────────────────────────────────────────────────────────────
// BrandCoverForm — drag-drop uploader for the brand About-page cover
// photo. Visually distinct from BrandLogoForm: the preview is wide
// (3:1-ish letterbox aspect) since cover photos are full-bleed editorial
// hero images, not square logo marks. Otherwise wires the same Server
// Action flow as the logo form so admins don't have to learn a new UX.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud, X } from "lucide-react";
import {
  uploadBrandCoverAction,
  clearBrandCoverAction,
  type ActionState,
} from "@/app/admin/categories/actions";
import { cn } from "@/lib/utils";

const INITIAL: ActionState = { ok: false };

export function BrandCoverForm({
  brandId,
  coverImageUrl,
}: {
  brandId: string;
  coverImageUrl: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(uploadBrandCoverAction, INITIAL);
  const [clearState, clearAction] = useActionState(
    clearBrandCoverAction,
    INITIAL,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [, startRefresh] = useTransition();

  return (
    <div className="space-y-4">
      {/* ── Wide preview ─────────────────────────────────────────────
          Cover photos are letterbox (typically ~3:1 aspect), so the
          preview is generously wide rather than the square swatch the
          logo form uses. */}
      {coverImageUrl ? (
        <div className="relative aspect-[3/1] w-full overflow-hidden border border-ink/10 bg-rice-dim/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImageUrl}
            alt="Brand cover"
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-[3/1] w-full items-center justify-center border border-dashed border-ink/20 bg-white/60 text-ink-mid">
          <div className="flex flex-col items-center gap-2">
            <UploadCloud className="h-8 w-8" />
            <span className="text-[12px]">No cover photo yet.</span>
          </div>
        </div>
      )}

      {/* ── Drop zone + actions ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <form
          action={action}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file && fileRef.current) {
              const dt = new DataTransfer();
              dt.items.add(file);
              fileRef.current.files = dt.files;
              (e.currentTarget as HTMLFormElement).requestSubmit();
            }
          }}
          className={cn(
            "flex flex-1 items-center gap-3 border border-dashed px-4 py-3 text-[12px] text-ink-mid transition-colors",
            isDragging ? "border-ink bg-ink/5" : "border-ink/20 bg-white/60",
          )}
        >
          <input type="hidden" name="id" value={brandId} />
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept="image/png,image/webp,image/jpeg"
            onChange={(e) => {
              if (e.target.files?.length) {
                startRefresh(() => {
                  (e.currentTarget.form as HTMLFormElement).requestSubmit();
                });
              }
            }}
            className="sr-only"
            id={`cover-upload-${brandId}`}
          />
          <label
            htmlFor={`cover-upload-${brandId}`}
            className="cursor-pointer border border-ink bg-ink px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-ink/90"
          >
            Choose cover
          </label>
          <span>Or drop a PNG / WEBP / JPG here. Max 5 MB.</span>
          <UploadIndicator />
        </form>

        <div className="flex flex-col items-start gap-2">
          {state.message && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-[12px]",
                state.ok ? "text-sage" : "text-vermilion",
              )}
              role="status"
            >
              {state.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {state.message}
            </span>
          )}

          {coverImageUrl && (
            <form
              action={(fd) => {
                clearAction(fd);
                startRefresh(() => router.refresh());
              }}
            >
              <input type="hidden" name="id" value={brandId} />
              <ClearButton />
            </form>
          )}

          {clearState.message && !clearState.ok && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-vermilion">
              <AlertCircle className="h-3.5 w-3.5" />
              {clearState.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadIndicator() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-ink">
      <Loader2 className="h-3 w-3 animate-spin" />
      Uploading…
    </span>
  );
}

function ClearButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 text-[11px] uppercase tracking-label text-ink-mid hover:text-vermilion disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
      Remove cover
    </button>
  );
}
