"use client";

// ─────────────────────────────────────────────────────────────────────────
// MediaPicker — compact image picker for the banner form.
//
// Shows the currently-selected image prominently; below it, a scrollable
// grid of thumbs. Clicking a thumb updates the hidden `mediaId` field.
//
// Also surfaces the selected Media's alt text inline — homepage banners are
// among the most visible images on the site, so a missing alt is an
// accessibility and SEO hit we want to catch at edit time. The alt editor
// writes back to the Media row (shared across any banner/product using it).
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import {
  updateMediaAltAction,
  type ActionState,
} from "@/app/admin/media/actions";
import { cn } from "@/lib/utils";

export type PickerMedia = {
  id: string;
  url: string;
  alt: string | null;
};

const ALT_INITIAL: ActionState = { ok: false };

export function MediaPicker({
  library,
  defaultMediaId,
  defaultMediaUrl,
  defaultMediaAlt,
}: {
  library: PickerMedia[];
  defaultMediaId: string | null;
  defaultMediaUrl: string | null;
  defaultMediaAlt: string | null;
}) {
  const [selected, setSelected] = useState<PickerMedia | null>(
    defaultMediaId && defaultMediaUrl
      ? {
          id: defaultMediaId,
          url: defaultMediaUrl,
          alt: defaultMediaAlt,
        }
      : null,
  );

  const missingAlt = !!selected && !(selected.alt && selected.alt.trim());

  return (
    <div className="space-y-3">
      {/* The form reads the currently-selected id from here. */}
      <input type="hidden" name="mediaId" value={selected?.id ?? ""} />

      {/* preview */}
      <div className="relative aspect-[16/9] w-full overflow-hidden border border-ink/10 bg-ink/5">
        {selected ? (
          <Image
            src={selected.url}
            alt={selected.alt ?? ""}
            fill
            sizes="(max-width: 800px) 100vw, 600px"
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
        {missingAlt && (
          <span
            title="No alt text — the banner will be invisible to screen readers"
            className="absolute right-2 top-2 inline-flex items-center gap-1 border border-gold/40 bg-gold/90 px-2 py-0.5 text-[10px] uppercase tracking-label text-white"
          >
            <AlertCircle className="h-3 w-3" />
            Alt missing
          </span>
        )}
      </div>

      {/*
        Inline alt-text editor. The banner reuses the Media row's alt — so
        editing it here also corrects every other banner/product pointing
        at the same image. Kept collapsed visually (small input, small button)
        so it doesn't compete with the banner copy section below.
      */}
      {selected && (
        <BannerAltEditor
          key={selected.id}
          mediaId={selected.id}
          initial={selected.alt ?? ""}
          onSaved={(newAlt) =>
            setSelected({ ...selected, alt: newAlt })
          }
        />
      )}

      {/* library */}
      {library.length === 0 ? (
        <p className="text-[12px] text-ink-mid">
          The media library is empty. Upload images from a product page, or
          in <a href="/admin/media" className="underline">/admin/media</a>.
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto border border-ink/10 bg-white/50 p-2">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {library.map((m) => {
              const on = selected?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m)}
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
                    sizes="120px"
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
// BannerAltEditor — inline alt-text input for the currently-selected Media.
//
// Wraps the shared `updateMediaAltAction` so the banner surface doesn't need
// its own server action. Tracks the input value in local state so we can tell
// the parent (MediaPicker) exactly what was saved, letting it update its
// `selected.alt` preview without a full router.refresh().
//
// Keyed by `mediaId` in the parent — when an admin clicks a different thumb, the
// editor remounts with that image's alt as the new initial value.
// ─────────────────────────────────────────────────────────────────────────
function BannerAltEditor({
  mediaId,
  initial,
  onSaved,
}: {
  mediaId: string;
  initial: string;
  onSaved: (newAlt: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [state, formAction] = useActionState(updateMediaAltAction, ALT_INITIAL);

  // When the server confirms the save, bubble the new alt up so the preview
  // badge flips from "Alt missing" to present without a full refresh.
  useEffect(() => {
    if (state.ok) onSaved(value.trim());
    // Deliberately only react to `state` changing — `value` updates with
    // keystrokes and we don't want to fire onSaved on every one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={mediaId} />
      <input
        type="text"
        name="alt"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={200}
        placeholder="Describe the image (shown to screen readers & search engines)"
        className="flex-1 border border-ink/15 bg-white px-3 py-1.5 text-[12px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
      />
      <SaveAltButton />
      {state.ok && (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-sage"
          role="status"
        >
          <CheckCircle2 className="h-3 w-3" />
          Saved
        </span>
      )}
      {state.message && !state.ok && (
        <span className="text-[11px] text-vermilion">{state.message}</span>
      )}
    </form>
  );
}

function SaveAltButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 border border-ink/15 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink transition-colors hover:border-ink disabled:opacity-50"
    >
      {pending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving
        </>
      ) : (
        "Save alt"
      )}
    </button>
  );
}
