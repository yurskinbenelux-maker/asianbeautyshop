"use client";

// ─────────────────────────────────────────────────────────────────────────
// InstagramPostForm — shared client form for both create + edit on
// /admin/marketing/instagram. Reuses the same MediaPicker pattern as
// the banner editor so Sofia's flow is consistent: select an image
// from the library, fill in the post URL + sort order + active flag,
// save.
//
// State:
//   · selectedMedia — drives the imageUrl/imageAlt hidden inputs.
//     Picking a thumb in the library updates these in real time.
//   · Other fields are uncontrolled — defaultValues hand-fed for
//     the edit mode, blank for create.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PickerMedia = {
  id: string;
  url: string;
  alt: string | null;
};

type DefaultValues = {
  id?: string;
  postUrl?: string;
  imageUrl?: string;
  imageAlt?: string;
  caption?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export function InstagramPostForm({
  mode,
  action,
  mediaLibrary,
  defaultValues = {},
}: {
  mode: "create" | "edit";
  /** Server action — same signature for both modes. */
  action: (formData: FormData) => Promise<void>;
  mediaLibrary: PickerMedia[];
  defaultValues?: DefaultValues;
}) {
  // Pre-select the matching media row in edit mode by URL match.
  const initialSelected =
    defaultValues.imageUrl && defaultValues.imageUrl.trim()
      ? mediaLibrary.find((m) => m.url === defaultValues.imageUrl) ??
        // Fallback: paste-only URL not in the library — show it
        // as a "current image" pseudo-row so the picker is honest
        // about what's currently saved.
        ({
          id: "external",
          url: defaultValues.imageUrl,
          alt: defaultValues.imageAlt ?? null,
        } as PickerMedia)
      : null;

  const [selected, setSelected] = useState<PickerMedia | null>(
    initialSelected,
  );

  return (
    <form action={action} className="mt-5 space-y-6">
      {defaultValues.id && (
        <input type="hidden" name="id" value={defaultValues.id} />
      )}

      {/* Image picker writes into these hidden inputs. */}
      <input type="hidden" name="imageUrl" value={selected?.url ?? ""} />
      <input type="hidden" name="imageAlt" value={selected?.alt ?? ""} />

      <ImageBlock
        selected={selected}
        onClear={() => setSelected(null)}
        library={mediaLibrary}
        onPick={(m) => setSelected(m)}
      />

      <Field
        label="Instagram post URL"
        name="postUrl"
        defaultValue={defaultValues.postUrl ?? ""}
        placeholder="https://www.instagram.com/p/XXXXXXXX/  (or /reel/, /tv/)"
        required
        hint="Where the tile clicks through to."
      />

      <Field
        label="Caption overlay (optional)"
        name="caption"
        defaultValue={defaultValues.caption ?? ""}
        placeholder="Short overlay text shown on hover"
        hint="Leave blank to show the image only on hover."
        maxLength={300}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Sort order"
          name="sortOrder"
          type="number"
          defaultValue={String(defaultValues.sortOrder ?? 0)}
          required
          hint="Lower numbers come first."
        />
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={defaultValues.isActive ?? true}
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
          {mode === "create" ? "Add post" : "Save tile"}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ImageBlock — picker UI. Big preview on top, thumbnail grid below
// scoped to ~250px tall so the form stays compact.
// ─────────────────────────────────────────────────────────────────────────

function ImageBlock({
  selected,
  onClear,
  library,
  onPick,
}: {
  selected: PickerMedia | null;
  onClear: () => void;
  library: PickerMedia[];
  onPick: (m: PickerMedia) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-label text-ink-mid">
          Tile image (required)
        </span>
        {selected && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] uppercase tracking-label text-vermilion hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Preview at the displayed aspect ratio (4:5 portrait, matches the
          homepage tile so there are no surprises) */}
      <div className="relative aspect-[4/5] w-full max-w-[240px] overflow-hidden border border-ink/10 bg-ink/5">
        {selected ? (
          <Image
            src={selected.url}
            alt={selected.alt ?? ""}
            fill
            sizes="240px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-mid">
            <ImageIcon className="h-6 w-6" />
            <span className="text-[11px] uppercase tracking-label">
              No image selected
            </span>
          </div>
        )}
      </div>

      {/* Library grid — scrolls if it gets long */}
      {library.length === 0 ? (
        <p className="text-[12px] text-ink-mid">
          The media library is empty. Upload an image at{" "}
          <Link href="/admin/media" className="underline">
            /admin/media
          </Link>
          .
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto border border-ink/10 bg-white/50 p-2">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {library.map((m) => {
              const on = selected?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPick(m)}
                  className={cn(
                    "relative aspect-square overflow-hidden border transition-colors",
                    on ? "border-ink" : "border-ink/10 hover:border-ink/40",
                  )}
                  aria-pressed={on}
                  aria-label={m.alt ?? "Image"}
                >
                  <Image
                    src={m.url}
                    alt={m.alt ?? ""}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                  {on && (
                    <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Field — small uncontrolled labeled input. Same style as the rest
// of the admin forms so the surface stays consistent.
// ─────────────────────────────────────────────────────────────────────────

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
