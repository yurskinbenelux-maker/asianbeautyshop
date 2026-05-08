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

/** Parse the stored "X% Y%" string back into numeric percentages.
 *  Anything that doesn't match (null, legacy keywords, hand-edited
 *  garbage) defaults to centred. Mirrors resolveCoverPosition in
 *  queries/products.ts. */
function parseInitialPosition(raw: string | null): { x: number; y: number } {
  if (!raw) return { x: 50, y: 50 };
  const m = raw.match(/^(\d{1,3})% (\d{1,3})%$/);
  if (!m) return { x: 50, y: 50 };
  const x = Math.min(100, Math.max(0, Number.parseInt(m[1], 10)));
  const y = Math.min(100, Math.max(0, Number.parseInt(m[2], 10)));
  return { x, y };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function BrandCoverForm({
  brandId,
  coverImageUrl,
  coverPosition,
}: {
  brandId: string;
  coverImageUrl: string | null;
  /** "X% Y%" (0-100 each) or null = centred. */
  coverPosition: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
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

  // Drag-pick focal point. `pos` is the current visual state; `dragging`
  // gates pointermove updates so a passive mouse hover doesn't trigger
  // saves. Initialised from the saved value so an admin returning to
  // the page sees their previous choice.
  const [pos, setPos] = useState(() => parseInitialPosition(coverPosition));
  const [pointerActive, setPointerActive] = useState(false);

  const objectPositionCss = `${pos.x}% ${pos.y}%`;

  /** Translate a pointer event to a 0-100 % coordinate inside the
   *  preview's bounding box. Clamped so off-edge drags pin to the
   *  nearest valid value rather than wrapping. */
  function calcPos(e: React.PointerEvent<HTMLDivElement>): {
    x: number;
    y: number;
  } {
    const el = previewRef.current;
    if (!el) return pos;
    const rect = el.getBoundingClientRect();
    const x = Math.round(
      clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
    );
    const y = Math.round(
      clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    );
    return { x, y };
  }

  /** Persist the current pos to the server. Called on pointerup so a
   *  drag streams visual updates locally and only writes once at
   *  release. We build FormData directly rather than using a <form>
   *  element so the closure captures the freshest pos. */
  function persistPosition(next: { x: number; y: number }) {
    const fd = new FormData();
    fd.append("id", brandId);
    fd.append("coverPosition", `${next.x}% ${next.y}%`);
    positionAction(fd);
    startRefresh(() => router.refresh());
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!coverImageUrl) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPointerActive(true);
    setPos(calcPos(e));
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerActive) return;
    setPos(calcPos(e));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerActive) return;
    const finalPos = calcPos(e);
    setPointerActive(false);
    setPos(finalPos);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may have already been released — ignore */
    }
    persistPosition(finalPos);
  }

  return (
    <div className="space-y-4">
      {/* ── Interactive preview ──────────────────────────────────────
          The preview IS the focal-point picker. Click anywhere on the
          image to anchor the crop there; drag for fine-tuning. A
          circular handle marks the current focal point. The save
          fires on pointerup, so a drag streams local visual updates
          and only writes once when the admin releases.
          A short hint sits over the bottom-left so the affordance is
          obvious — unlike the previous 9-cell grid, there's no visible
          control to point at. */}
      {coverImageUrl ? (
        <div
          ref={previewRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setPointerActive(false)}
          className={cn(
            "relative aspect-[3/1] w-full overflow-hidden border border-ink/10 bg-rice-dim/40 select-none touch-none",
            pointerActive ? "cursor-grabbing" : "cursor-crosshair",
          )}
          role="application"
          aria-label="Cover photo focal-point picker"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImageUrl}
            alt="Brand cover"
            draggable={false}
            className={cn(
              "pointer-events-none h-full w-full object-cover",
              // Smooth the object-position change when not actively
              // dragging — during a drag the transition would lag the
              // pointer noticeably, so we disable it then.
              pointerActive
                ? ""
                : "transition-[object-position] duration-200",
            )}
            style={{ objectPosition: objectPositionCss }}
          />

          {/* Focal-point marker. Sits at (x%, y%) of the FRAME, which
              for object-cover semantics maps 1:1 to the photo's own
              x%/y% anchor — i.e. the ring shows the user "this point
              of the photo will land at this spot in the public crop". */}
          <div
            aria-hidden
            className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-vermilion/70 shadow-[0_0_0_2px_rgba(0,0,0,0.35)]"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          />

          {/* Hint label — only shows when the cover hasn't been
              repositioned yet (still at default centre). Once the
              admin moves the marker, the label fades to avoid
              competing with the photo. */}
          <div
            className={cn(
              "pointer-events-none absolute bottom-2 left-2 bg-ink/70 px-2 py-1 text-[10px] uppercase tracking-label text-rice transition-opacity",
              pos.x === 50 && pos.y === 50 && !pointerActive
                ? "opacity-100"
                : "opacity-0",
            )}
          >
            Click or drag to anchor focus
          </div>

          {/* Coordinate read-out — shown during drag so the admin can
              see the exact percentage they're committing to. */}
          {pointerActive && (
            <div className="pointer-events-none absolute bottom-2 right-2 bg-ink/80 px-2 py-1 font-mono text-[11px] text-rice">
              {pos.x}% / {pos.y}%
            </div>
          )}
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

      {/* ── Focal-point status + reset ────────────────────────────
          The picker itself lives on the preview above. This row is
          purely informational: a save/error indicator + a "centre"
          button so admins can revert to default without dragging
          back to the middle pixel-perfectly. */}
      {coverImageUrl && (
        <div className="flex items-center justify-between gap-3 border-t border-ink/10 pt-4 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-label text-ink-mid">
              Photo focus
            </span>
            <span className="font-mono text-[12px] text-ink">
              {pos.x}% / {pos.y}%
            </span>
            {positionState.message && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  positionState.ok ? "text-sage" : "text-vermilion",
                )}
                role="status"
              >
                {positionState.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                {positionState.ok ? "Saved." : positionState.message}
              </span>
            )}
          </div>
          {(pos.x !== 50 || pos.y !== 50) && (
            <button
              type="button"
              onClick={() => {
                const centred = { x: 50, y: 50 };
                setPos(centred);
                persistPosition(centred);
              }}
              className="text-[11px] uppercase tracking-label text-ink-mid hover:text-vermilion"
            >
              Reset to centre
            </button>
          )}
        </div>
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
