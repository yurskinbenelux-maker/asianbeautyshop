// ─────────────────────────────────────────────────────────────────────────
// LibraryUploader — drag-and-drop / pick-files zone at the top of the
// /admin/media page. Each picked file is uploaded as its own server
// action call so progress + errors stay per-file (one bad PNG can't
// kill the whole batch). Successful uploads kick off a router refresh
// so the new tile appears in the grid below.
//
// We use the FormData/server-action pattern instead of a fetch() to
// /api/upload because the rest of the admin already has a working
// uploadLibraryMediaAction in lib/email/... oh wait, this one lives
// in src/app/admin/media/actions.ts. Same pattern.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import {
  useCallback,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadLibraryMediaAction } from "@/app/admin/media/actions";

/** One item in the local upload queue — purely UI state. */
type Job = {
  id: string;
  fileName: string;
  status: "uploading" | "ok" | "error";
  message?: string;
};

export function LibraryUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [, startTransition] = useTransition();
  const [jobs, setJobs] = useState<Job[]>([]);

  const upload = useCallback(
    async (file: File) => {
      const id = crypto.randomUUID();
      setJobs((j) => [
        { id, fileName: file.name, status: "uploading" },
        ...j,
      ]);

      const fd = new FormData();
      fd.set("file", file);

      // Wrap the action call in a try/catch — server actions don't
      // throw on the action's own ok:false return, but they DO throw on
      // network/auth/Supabase outages. We surface both in the same way.
      try {
        const result = await uploadLibraryMediaAction({ ok: false }, fd);
        setJobs((j) =>
          j.map((row) =>
            row.id === id
              ? {
                  ...row,
                  status: result.ok ? "ok" : "error",
                  message: result.message,
                }
              : row,
          ),
        );
        if (result.ok) {
          // Refresh the server component (grid + counts) once the new
          // row is in DB. We wrap in startTransition to keep the UI
          // responsive — the queue stays interactive while the page
          // refetches in the background.
          startTransition(() => router.refresh());
        }
      } catch (err) {
        setJobs((j) =>
          j.map((row) =>
            row.id === id
              ? {
                  ...row,
                  status: "error",
                  message:
                    err instanceof Error ? err.message : "Upload failed.",
                }
              : row,
          ),
        );
      }
    },
    [router],
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      // Sequential upload, not parallel — Supabase Storage handles bursts
      // fine but Resend-side throttling on other admin actions has bitten
      // us before. Keeping uploads serial avoids surprise rate-limit hits.
      (async () => {
        for (const file of Array.from(files)) {
          await upload(file);
        }
      })();
    },
    [upload],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    onFiles(e.dataTransfer.files);
  };

  const dismissJob = (id: string) => {
    setJobs((j) => j.filter((row) => row.id !== id));
  };

  return (
    <section>
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex items-center justify-between gap-6 border bg-white/60 px-6 py-5 transition-colors",
          isDragging
            ? "border-ink bg-ink/5"
            : "border-dashed border-ink/20",
        )}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-ink/15 bg-rice/60 text-ink">
            <ImagePlus className="h-4 w-4" />
          </div>
          <div>
            <p className="font-display text-[16px] text-ink">
              Upload to library
            </p>
            <p className="mt-0.5 text-[12px] text-ink-mid">
              Drop images here, or use the button. JPG / PNG / WEBP / AVIF
              · up to 8&nbsp;MB each. Library uploads aren&apos;t linked
              to a product yet — open one and link it from the drawer.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[11px] uppercase tracking-label text-rice hover:bg-ink/90"
        >
          <Upload className="h-3.5 w-3.5" />
          Pick files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            // Allow re-picking the same file later (browsers ignore the
            // event if value isn't reset).
            e.target.value = "";
          }}
        />
      </div>

      {/* Per-file queue (only shown while jobs exist) */}
      {jobs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {jobs.map((job) => (
            <li
              key={job.id}
              className={cn(
                "flex items-center justify-between gap-3 border bg-white/60 px-3 py-2 text-[12px]",
                job.status === "error"
                  ? "border-vermilion/30 text-vermilion"
                  : job.status === "ok"
                    ? "border-sage/30 text-ink-mid"
                    : "border-ink/10 text-ink-mid",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {job.status === "uploading" && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                )}
                {job.status === "ok" && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sage" />
                )}
                {job.status === "error" && (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">{job.fileName}</span>
                {job.message && job.status === "error" && (
                  <span className="text-[11px] italic">— {job.message}</span>
                )}
              </div>
              {(job.status === "ok" || job.status === "error") && (
                <button
                  type="button"
                  onClick={() => dismissJob(job.id)}
                  className="text-[10px] uppercase tracking-label text-ink-mid hover:text-ink"
                >
                  Dismiss
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
