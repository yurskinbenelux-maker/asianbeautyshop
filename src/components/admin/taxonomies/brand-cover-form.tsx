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
  setBrandCoverPositionAction,
  type ActionState,
} from "@/app/admin/categories/actions";
import { cn } from "@/lib/utils";

const INITIAL: ActionState = { ok: false };

// Mapping that mirrors COVER_POSITION_TO_CSS in queries/products.ts. We
// keep a copy here so the admin preview shows the same crop as the
// public page without round-tripping through the server.
const POSITION_CSS: Record<string, string> = {
  "top-left": "left top",
  top: "center top",
  "top-right": "right top",
  left: "left center",
  center: "center center",
  right: "right center",
  "bottom-left": "left bottom",
  bottom: "center bottom",
  "bottom-right": "right bottom",
};

const POSITION_GRID = [
  ["top-left", "top", "top-right"],
  ["left", "center", "right"],
  ["bottom-left", "bottom", "bottom-right"],
] as const;

export function BrandCoverForm({
  brandId,
  coverImageUrl,
  coverPosition,
}: {
  brandId: string;
  coverImageUrl: string | null;
  /** One of the nine keywords or null (= centred). */
  coverPosition: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(uploadBrandCoverAction, INITIAL);
  const [clearState, clearAction] = useActionState(
    clearBrandCoverAction,
    INITIAL,
  );
  const [positionState, positionAction] = useActionState(
    setBrandCoverPositionAction,
    INITIAL,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [, startRefresh] = useTransition();
  // Optimistic local state so the preview snaps as soon as the admin
  // clicks a cell — the actual save happens in the background and
  // router.refresh() reconciles afterwards.
  const [activePosition, setActivePosition] = useState<string>(
    coverPosition ?? "center",
  );

  const previewPositionCss =
    POSITION_CSS[activePosition] ?? POSITION_CSS.center;

  return (
    <div className="space-y-4">
      {/* ── Wide preview ─────────────────────────────────────────────
          Cover photos are letterbox (typically ~3:1 aspect), so the
          preview is generously wide rather than the square swatch the
          logo form uses. The preview honours the focal-point picker
          below so an admin can see how the public page will crop
          before saving. */}
      {coverImageUrl ? (
        <div className="relative aspect-[3/1] w-full overflow-hidden border border-ink/10 bg-rice-dim/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImageUrl}
            alt="Brand cover"
            className="h-full w-full object-cover transition-[object-position] duration-200"
            style={{ objectPosition: previewPositionCss }}
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

      {/* ── Focal-point picker ────────────────────────────────────
          Only meaningful when there's a photo to anchor — hidden when
          the brand has no cover. The 3×3 grid mirrors `object-position`
          keywords; clicking a cell snaps the preview above and submits
          the new value to the server in the background so admins can
          experiment without filling out a form. */}
      {coverImageUrl && (
        <form
          action={(fd) => {
            positionAction(fd);
            startRefresh(() => router.refresh());
          }}
          className="mt-2 border-t border-ink/10 pt-5"
        >
          <input type="hidden" name="id" value={brandId} />
          {/* Hidden input is what actually travels to the server — the
              radio buttons below set its value via React state. We keep
              the input hidden (not the radios) so JS-disabled clients
              still get a working form via individual button submits. */}
          <input
            type="hidden"
            name="coverPosition"
            value={activePosition}
          />
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-label text-ink-mid">
                Photo focus
              </div>
              <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-ink-mid">
                Click a cell to anchor the crop. The preview above
                updates immediately. Use this when the default centred
                crop slices through faces or product hero shots.
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Cover photo focal point"
              className="grid grid-cols-3 gap-1.5"
            >
              {POSITION_GRID.flat().map((key) => {
                const selected = activePosition === key;
                return (
                  <button
                    key={key}
                    type="submit"
                    role="radio"
                    aria-checked={selected}
                    aria-label={key.replace("-", " ")}
                    onClick={() => setActivePosition(key)}
                    className={cn(
                      "relative h-8 w-8 border transition-colors",
                      selected
                        ? "border-ink bg-ink"
                        : "border-ink/20 bg-white hover:border-ink/60",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                        selected ? "bg-rice" : "bg-ink/40",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
          {positionState.message && (
            <span
              className={cn(
                "mt-3 inline-flex items-center gap-1.5 text-[12px]",
                positionState.ok ? "text-sage" : "text-vermilion",
              )}
              role="status"
            >
              {positionState.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {positionState.ok ? "Focus saved." : positionState.message}
            </span>
          )}
        </form>
      )}
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
