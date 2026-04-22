// ─────────────────────────────────────────────────────────────────────────
// BrandLogoForm — thin copy of CategoryIconForm that targets the brand
// upload actions. Could be generalised but keeping separate makes the
// Server Action binding explicit and easy to audit.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud, X } from "lucide-react";
import {
  uploadBrandLogoAction,
  clearBrandLogoAction,
  type ActionState,
} from "@/app/admin/categories/actions";
import { cn } from "@/lib/utils";

const INITIAL: ActionState = { ok: false };

export function BrandLogoForm({
  brandId,
  logoUrl,
}: {
  brandId: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(uploadBrandLogoAction, INITIAL);
  const [clearState, clearAction] = useActionState(
    clearBrandLogoAction,
    INITIAL,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [, startRefresh] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-6">
      {logoUrl ? (
        <div className="h-20 w-20 border border-ink/10 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="" className="h-full w-full object-contain p-2" />
        </div>
      ) : (
        <div className="flex h-20 w-20 items-center justify-center border border-dashed border-ink/20 bg-white/60 text-ink-mid">
          <UploadCloud className="h-6 w-6" />
        </div>
      )}

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
          accept="image/png,image/webp,image/svg+xml,image/jpeg"
          onChange={(e) => {
            if (e.target.files?.length) {
              startRefresh(() => {
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              });
            }
          }}
          className="sr-only"
          id={`logo-upload-${brandId}`}
        />
        <label
          htmlFor={`logo-upload-${brandId}`}
          className="cursor-pointer border border-ink bg-ink px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-ink/90"
        >
          Choose logo
        </label>
        <span>Or drop a PNG / WEBP / SVG here.</span>
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

        {logoUrl && (
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
      Remove logo
    </button>
  );
}
