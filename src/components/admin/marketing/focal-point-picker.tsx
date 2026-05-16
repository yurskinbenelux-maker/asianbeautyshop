// ─────────────────────────────────────────────────────────────────────────
// FocalPointPicker — visual editor for popup image `object-position`.
//
// Use case:
//   Welcome popup + quiz popup show one image scaled with CSS object-cover.
//   When the source photo is portrait and the popup slot is wide (desktop
//   ~410×480, mobile ~360×176), the auto-centred crop frequently hides the
//   most important part of the image (faces, products). This picker lets
//   an admin click/drag a pin on the full image to set where that crop
//   centres on, separately for desktop and mobile viewports — and shows
//   live preview thumbnails of exactly what the customer will see.
//
// How it integrates:
//   The component submits TWO hidden inputs with the form, named
//   `imageObjectPositionDesktop` and `imageObjectPositionMobile`. The
//   names match the Phase 1 text-input fields, so the existing server
//   action + Zod schema continue to work unchanged. Existing saved values
//   (including "center", "center top", "30% center", "50% 30%") are
//   parsed back into pin coordinates on mount.
//
// Why one picker per viewport (not one with a toggle):
//   Showing both crop previews simultaneously gives the admin instant
//   feedback that one pin position can look great on desktop and bad on
//   mobile. The two pins live in independent state and each have their
//   own live preview.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  /** The image being cropped. Passed in straight from the popup config
   *  so the picker always reflects whatever URL is currently saved. */
  imageUrl: string;
  /** Initial value to pre-fill the desktop pin (e.g. "30% center"). */
  initialDesktop: string;
  /** Initial value to pre-fill the mobile pin (e.g. "center 65%"). */
  initialMobile: string;
  /** Override the hidden-input names. Lets the same picker drive
   *  different forms (popups use imageObjectPosition*, video hero uses
   *  videoObjectPosition*, etc.). Defaults preserve the welcome/quiz
   *  popup names so existing callers keep working unchanged. */
  desktopFieldName?: string;
  mobileFieldName?: string;
};

/** Internal pin coordinates as percentages 0..100. */
type Pin = { x: number; y: number };

const CENTER: Pin = { x: 50, y: 50 };

/**
 * Parse a CSS object-position string into 0..100 % coordinates.
 *
 *   "center"           → 50, 50
 *   "center center"    → 50, 50
 *   "top" / "bottom"   → vertical-only keywords paired with center X
 *   "left" / "right"   → horizontal-only keywords paired with center Y
 *   "30% center"       → 30, 50
 *   "50% 30%"          → 50, 30
 *   "center 65%"       → 50, 65
 *
 * Unrecognised tokens silently fall through to "center" — same forgiving
 * behaviour as browsers themselves.
 */
function parseObjectPosition(value: string): Pin {
  const v = (value || "").trim().toLowerCase();
  if (!v || v === "center" || v === "center center") return { ...CENTER };

  const tokens = v.split(/\s+/).slice(0, 2);
  const xToken = tokens[0] ?? "center";
  const yToken = tokens[1] ?? "center";

  const xMap: Record<string, number> = {
    left: 0,
    center: 50,
    right: 100,
    top: 50,
    bottom: 50,
  };
  const yMap: Record<string, number> = {
    top: 0,
    center: 50,
    bottom: 100,
    left: 50,
    right: 50,
  };

  const toNum = (t: string, map: Record<string, number>): number => {
    if (t in map) return map[t];
    const m = t.match(/^(-?\d+(?:\.\d+)?)%$/);
    if (m) return Math.max(0, Math.min(100, parseFloat(m[1])));
    return 50;
  };

  // CSS allows the first token to be a Y keyword if it's "top"/"bottom"
  // and the second token an X keyword. We handle the common writing
  // order (X first) since admin instructions always show that pattern.
  return {
    x: toNum(xToken, xMap),
    y: toNum(yToken, yMap),
  };
}

/** Render a Pin back to the canonical "X% Y%" CSS string. */
function formatObjectPosition(p: Pin): string {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  return `${x}% ${y}%`;
}

export function FocalPointPicker({
  imageUrl,
  initialDesktop,
  initialMobile,
  desktopFieldName = "imageObjectPositionDesktop",
  mobileFieldName = "imageObjectPositionMobile",
}: Props) {
  const [desktop, setDesktop] = useState<Pin>(() =>
    parseObjectPosition(initialDesktop),
  );
  const [mobile, setMobile] = useState<Pin>(() =>
    parseObjectPosition(initialMobile),
  );

  // Which viewport is currently being edited. Both stay visible at all
  // times (so the admin sees both previews) but only one pin is active
  // on the main image at a time — clicking the main image moves THAT pin.
  const [activeViewport, setActiveViewport] = useState<"desktop" | "mobile">(
    "desktop",
  );

  // Re-parse when the image URL changes (rare, but if an admin pastes a
  // new URL the previously-set pin may no longer make sense). We do NOT
  // re-parse on initialDesktop/Mobile changes — those are only the
  // initial values, the picker owns the state thereafter.
  useEffect(() => {
    // Intentionally empty — kept as a placeholder for future "reset on
    // image change" behaviour if we ever want it.
  }, [imageUrl]);

  // Show empty state when there's no image yet — admin hasn't pasted a
  // URL or the popup is disabled. The hidden inputs still submit (so the
  // saved value survives), but the picker UI is hidden.
  if (!imageUrl) {
    return (
      <div className="border border-dashed border-ink/15 px-4 py-6 text-[12px] text-ink-mid">
        Upload or paste an image URL above to use the visual focal-point
        picker.
        <input
          type="hidden"
          name={desktopFieldName}
          value={formatObjectPosition(desktop)}
        />
        <input
          type="hidden"
          name={mobileFieldName}
          value={formatObjectPosition(mobile)}
        />
      </div>
    );
  }

  const activePin = activeViewport === "desktop" ? desktop : mobile;
  const setActivePin = activeViewport === "desktop" ? setDesktop : setMobile;

  return (
    <div className="space-y-4">
      {/* Hidden inputs — what the server action actually reads. Same
          field names as the Phase 1 text inputs so no action change. */}
      <input
        type="hidden"
        name="imageObjectPositionDesktop"
        value={formatObjectPosition(desktop)}
      />
      <input
        type="hidden"
        name="imageObjectPositionMobile"
        value={formatObjectPosition(mobile)}
      />

      <div className="flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid">
        <span>Editing:</span>
        <button
          type="button"
          onClick={() => setActiveViewport("desktop")}
          className={
            activeViewport === "desktop"
              ? "bg-ink px-2 py-1 text-rice"
              : "border border-ink/20 px-2 py-1 hover:bg-ink/5"
          }
          aria-pressed={activeViewport === "desktop"}
        >
          Desktop
        </button>
        <button
          type="button"
          onClick={() => setActiveViewport("mobile")}
          className={
            activeViewport === "mobile"
              ? "bg-ink px-2 py-1 text-rice"
              : "border border-ink/20 px-2 py-1 hover:bg-ink/5"
          }
          aria-pressed={activeViewport === "mobile"}
        >
          Mobile
        </button>
        <span className="ml-auto tabular-nums text-ink-mid/70">
          {formatObjectPosition(activePin)}
        </span>
      </div>

      {/* Main interaction surface: full image with a draggable pin */}
      <PinSurface
        imageUrl={imageUrl}
        pin={activePin}
        onChange={setActivePin}
      />

      {/* Live crop previews — both viewports shown side by side so the
          admin sees how each pin position affects the actual customer
          view. Aspect ratios match what the popup renders at:
            · Desktop popup image: ~410 wide × 480 tall → 41/48
            · Mobile popup image:   full width × h-44 (176)
              At 360 wide that's 360/176 ≈ 2.05/1
          We render the previews at fixed display widths (180px / 220px)
          so they fit on a typical admin form column. */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        <CropPreview
          label="Desktop preview"
          imageUrl={imageUrl}
          pin={desktop}
          aspectClass="aspect-[41/48]"
        />
        <CropPreview
          label="Mobile preview"
          imageUrl={imageUrl}
          pin={mobile}
          aspectClass="aspect-[360/176]"
        />
      </div>

      <p className="text-[11px] leading-relaxed text-ink-mid">
        Click the image above to set the focal point, or drag the pin.
        Switch between Desktop and Mobile to set each viewport independently.
        The two previews below show exactly what customers see.
      </p>
    </div>
  );
}

// ────────── interactive image surface with draggable pin ──────────────

function PinSurface({
  imageUrl,
  pin,
  onChange,
}: {
  imageUrl: string;
  pin: Pin;
  onChange: (p: Pin) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Translate a pointer event's clientX/clientY into a 0..100 pin
  // coordinate relative to the image bounding box. Clamped so the pin
  // never escapes the image.
  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    onChange({ x, y });
  };

  // Drag handling — we listen on window so the pin keeps tracking even
  // when the cursor briefly leaves the image bounds (Tailwind's default
  // overflow hides nothing, but the calc clamps so it's harmless).
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => updateFromPointer(e.clientX, e.clientY);
    const onUp = () => setIsDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // Re-bind when isDragging flips. updateFromPointer is stable enough
    // for our purposes — it closes over `onChange` which the parent
    // memoises via useState's setter (stable identity).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden border border-ink/15 bg-ink/5"
      // Cap the height so a 3000px portrait shot doesn't take over the
      // whole admin page. max-h-[420px] keeps the picker usable while
      // still showing enough detail to set a pin precisely.
      style={{ maxHeight: 420 }}
      onPointerDown={(e) => {
        // Only start drag on primary button (left click / touch).
        if (e.button !== 0 && e.pointerType === "mouse") return;
        setIsDragging(true);
        updateFromPointer(e.clientX, e.clientY);
        // Capture so subsequent pointermove events fire even if the
        // cursor leaves the element. Falls back to the window listeners
        // in the useEffect above.
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
    >
      {/* The image itself — object-contain so the WHOLE photograph is
          visible to the admin (this is the editor; we're choosing the
          crop, not previewing it). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        className="block max-h-[420px] w-full object-contain"
      />

      {/* Crosshair pin — positioned absolutely at the chosen X%, Y%.
          Translates by -50% so the centre of the pin lines up with the
          coordinates (not the top-left of the pin element). */}
      <div
        className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rice bg-vermilion shadow-[0_0_0_2px_rgba(20,17,15,0.4)]"
        style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
        aria-hidden
      />
    </div>
  );
}

// ────────── live crop preview ────────────────────────────────────────

/**
 * Renders the cropped image at the actual popup aspect ratio. Uses CSS
 * background-image with background-size: cover + background-position to
 * EXACTLY mirror the behaviour of <Image className="object-cover"
 * style={{objectPosition: ...}}> in the real popup component. Whatever
 * the admin sees here is what the customer will see.
 */
function CropPreview({
  label,
  imageUrl,
  pin,
  aspectClass,
}: {
  label: string;
  imageUrl: string;
  pin: Pin;
  aspectClass: string;
}) {
  const positionCss = useMemo(
    () => `${Math.round(pin.x)}% ${Math.round(pin.y)}%`,
    [pin.x, pin.y],
  );

  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </div>
      <div
        className={`relative w-full overflow-hidden border border-ink/15 bg-ink/5 ${aspectClass}`}
        style={{
          backgroundImage: `url("${imageUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: positionCss,
        }}
      />
      <div className="mt-1 tabular-nums text-[10px] text-ink-mid/70">
        {positionCss}
      </div>
    </div>
  );
}
