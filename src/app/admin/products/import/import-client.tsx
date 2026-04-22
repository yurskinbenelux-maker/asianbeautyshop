// ─────────────────────────────────────────────────────────────────────────
// Client UI for /admin/products/import.
//
// Three-stage flow, no page reloads:
//
//   1. Upload — drag-drop zone or file picker. We read the File → text on
//      the client so we can pass a plain string down to the server actions
//      (keeps FormData simple, dodges the Next.js 4 MB streaming limit for
//      file parts that browsers sometimes misconfigure).
//
//   2. Preview — the server returns a parsed preview (NEW / UPDATE /
//      ERROR for each row + warnings). We render a table with expandable
//      error/warning details so Sofia can fix the CSV offline and re-
//      upload without guessing.
//
//   3. Commit — we re-send the CSV text to commitProductImport, which
//      re-parses it (never trusting client-mutated rows) and writes. We
//      show a final summary card with created / updated / failed counts.
//
// All server work is done via two server-action useActionState pairs.
// ─────────────────────────────────────────────────────────────────────────

"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  commitProductImport,
  previewProductImport,
  type CommitResult,
  type PreviewResult,
  type PreviewRow,
} from "./actions";

// ────────── component ───────────────────────────────────────────────────

export function ProductImportClient() {
  // Source of truth for what gets sent to the server. Held in state so the
  // commit action gets the *exact* same text the preview ran on.
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [previewState, previewAction, isPreviewing] = useActionState<
    PreviewResult | null,
    FormData
  >(previewProductImport, null);

  const [commitState, commitAction, isCommitting] = useActionState<
    CommitResult | null,
    FormData
  >(commitProductImport, null);

  const resetAll = () => {
    setCsvText(null);
    setFileName(null);
    setReadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Action state can't be explicitly reset — the user clicking "Start
    // over" unmounts the rendered preview/commit and the ref reset handles
    // the file picker. On the next submission both pipes get fresh state.
  };

  const loadFile = async (file: File) => {
    setReadError(null);
    try {
      const text = await file.text();
      setCsvText(text);
      setFileName(file.name);
    } catch (err) {
      console.error("[import] file read failed", err);
      setReadError(
        "Couldn't read that file — make sure it's a UTF-8 CSV and try again.",
      );
    }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  // If the commit succeeded, take over the entire view with a result card.
  if (commitState?.ok) {
    return (
      <CommitResultView
        result={commitState}
        onStartOver={() => {
          resetAll();
          // Triggering a full refresh is wasteful — the card already shows
          // the counts. A "Back to catalogue" link is the natural CTA.
        }}
      />
    );
  }

  const hasPreview = previewState?.ok === true;
  const canCommit =
    hasPreview &&
    previewState.summary.newCount + previewState.summary.updateCount > 0;

  return (
    <div className="space-y-10">
      {/* ── 1. upload */}
      {!hasPreview && (
        <form action={previewAction} className="space-y-4">
          <label
            htmlFor="csv-file"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center border-2 border-dashed bg-white/40 px-6 py-14 text-center transition-colors",
              isDragOver
                ? "border-ink bg-white/80"
                : "border-ink/20 hover:border-ink/40",
              csvText && "border-ink/40 bg-white/80",
            )}
          >
            {csvText ? (
              <>
                <FileSpreadsheet
                  className="h-10 w-10 text-ink"
                  aria-hidden
                />
                <div className="mt-4 font-display text-[18px] text-ink">
                  {fileName ?? "pasted.csv"}
                </div>
                <p className="mt-1 text-[12px] text-ink-mid">
                  {formatBytes(csvText.length)} · ready to preview
                </p>
              </>
            ) : (
              <>
                <CloudUpload
                  className="h-10 w-10 text-ink-mid"
                  aria-hidden
                />
                <div className="mt-4 font-display text-[20px] text-ink">
                  Drop a CSV here
                </div>
                <p className="mt-1 text-[12px] text-ink-mid">
                  or click to choose a file from your computer
                </p>
              </>
            )}
            <input
              id="csv-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel"
              className="sr-only"
              onChange={onFilePick}
            />
          </label>

          {readError && (
            <p className="text-[12px] text-vermilion">{readError}</p>
          )}

          {/* The CSV text is smuggled along as a hidden input — that way
              the action is a pure server-side parse against a JSON-safe
              string instead of a multipart file part. */}
          {csvText && (
            <input type="hidden" name="csv" value={csvText} />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!csvText || isPreviewing}
              className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPreviewing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Parsing…
                </>
              ) : (
                <>Preview rows</>
              )}
            </button>
            {csvText && !isPreviewing && (
              <button
                type="button"
                onClick={resetAll}
                className="text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
              >
                Clear file
              </button>
            )}
          </div>

          {previewState && previewState.ok === false && (
            <p className="text-[12px] text-vermilion">{previewState.message}</p>
          )}
        </form>
      )}

      {/* ── 2. preview */}
      {hasPreview && (
        <div className="space-y-6">
          <SummaryBar summary={previewState.summary} />

          {previewState.fileErrors.length > 0 && (
            <div className="border border-vermilion/40 bg-vermilion/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 text-vermilion"
                  aria-hidden
                />
                <div>
                  <div className="text-[12px] font-medium uppercase tracking-label text-vermilion">
                    File-level problems
                  </div>
                  <ul className="mt-2 space-y-1 text-[13px] text-ink">
                    {previewState.fileErrors.map((err, i) => (
                      <li key={i}>· {err}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <PreviewTable rows={previewState.rows} />

          {/* ── 3. commit */}
          <form action={commitAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="csv" value={previewState.csvText} />
            <button
              type="submit"
              disabled={!canCommit || isCommitting}
              className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Importing…
                </>
              ) : (
                <>
                  Import {previewState.summary.newCount +
                    previewState.summary.updateCount}{" "}
                  row
                  {previewState.summary.newCount +
                    previewState.summary.updateCount ===
                  1
                    ? ""
                    : "s"}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-2 text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Choose another file
            </button>

            {commitState && commitState.ok === false && (
              <p className="w-full text-[12px] text-vermilion">
                {commitState.message}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

// ────────── summary bar ────────────────────────────────────────────────

function SummaryBar({
  summary,
}: {
  summary: { total: number; newCount: number; updateCount: number; errorCount: number };
}) {
  return (
    <div className="grid gap-4 border border-ink/10 bg-white/60 p-5 text-[13px] md:grid-cols-4">
      <Stat label="Rows" value={summary.total} />
      <Stat label="Create" value={summary.newCount} tone="positive" />
      <Stat label="Update" value={summary.updateCount} tone="neutral" />
      <Stat label="Skip" value={summary.errorCount} tone="warning" />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "positive" | "neutral" | "warning";
}) {
  const valueClass =
    tone === "positive"
      ? "text-sage"
      : tone === "warning"
        ? "text-vermilion"
        : "text-ink";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-[26px] leading-none tabular-nums",
          valueClass,
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ────────── preview table ──────────────────────────────────────────────

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  // Sort errors first so Sofia can scan them without scrolling. Inside each
  // group, keep CSV order for easy cross-reference with the source file.
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const rank = (r: PreviewRow) =>
        r.state.kind === "error" ? 0 : r.warnings.length > 0 ? 1 : 2;
      const diff = rank(a) - rank(b);
      return diff !== 0 ? diff : a.rowNumber - b.rowNumber;
    });
  }, [rows]);

  if (sorted.length === 0) {
    return (
      <div className="border border-ink/10 bg-white/60 px-6 py-10 text-center text-[13px] text-ink-mid">
        No rows parsed from this file.
      </div>
    );
  }

  return (
    <div className="border border-ink/10 bg-white/60">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-label text-ink-mid">
            <Th className="w-[64px]">Row</Th>
            <Th className="w-[120px]">SKU</Th>
            <Th>Name</Th>
            <Th className="w-[80px] text-right">Price</Th>
            <Th className="w-[110px]">Action</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <PreviewRowView key={row.rowNumber} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewRowView({ row }: { row: PreviewRow }) {
  const [expanded, setExpanded] = useState(
    row.state.kind === "error" || row.warnings.length > 0,
  );

  const kind = row.state.kind;
  const hasDetail = kind === "error" || row.warnings.length > 0;

  return (
    <>
      <tr
        className={cn(
          "border-b border-ink/5 last:border-0",
          hasDetail && "cursor-pointer hover:bg-ink/[0.02]",
        )}
        onClick={() => hasDetail && setExpanded((v) => !v)}
      >
        <Td className="tabular-nums text-ink-mid">{row.rowNumber}</Td>
        <Td className="font-mono text-[12px] text-ink">{row.sku || "—"}</Td>
        <Td>
          <div className="text-ink">{row.nameEn || "—"}</div>
          {row.warnings.length > 0 && kind !== "error" && (
            <div className="mt-0.5 text-[11px] text-vermilion/90">
              {row.warnings.length} warning
              {row.warnings.length === 1 ? "" : "s"}
            </div>
          )}
        </Td>
        <Td className="text-right tabular-nums text-ink-mid">
          {row.priceEur
            ? `€ ${Number(row.priceEur.replace(",", ".")).toFixed(2)}`
            : "—"}
        </Td>
        <Td>
          <ActionBadge state={row.state} />
        </Td>
      </tr>
      {expanded && hasDetail && (
        <tr className="border-b border-ink/5 last:border-0 bg-rice/50">
          <td colSpan={5} className="px-4 py-3 text-[12px] text-ink-mid">
            {kind === "error" && (
              <div className="flex items-start gap-2">
                <XCircle
                  className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-vermilion"
                  aria-hidden
                />
                <ul className="space-y-0.5">
                  {row.state.kind === "error" &&
                    row.state.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                </ul>
              </div>
            )}
            {row.warnings.length > 0 && (
              <div
                className={cn(
                  "flex items-start gap-2",
                  kind === "error" ? "mt-3" : "",
                )}
              >
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-vermilion"
                  aria-hidden
                />
                <ul className="space-y-0.5">
                  {row.warnings.map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ActionBadge({ state }: { state: PreviewRow["state"] }) {
  if (state.kind === "new") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-label text-sage">
        New
      </span>
    );
  }
  if (state.kind === "update") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-label text-ink-mid">
        Update
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-label text-vermilion">
      Skip
    </span>
  );
}

// ────────── final commit result ────────────────────────────────────────

function CommitResultView({
  result,
  onStartOver,
}: {
  result: Extract<CommitResult, { ok: true }>;
  onStartOver: () => void;
}) {
  return (
    <div className="border border-ink/10 bg-white/60 p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-sage/40 bg-sage/10 text-sage">
          <CheckCircle2 className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <div className="eyebrow">Import complete</div>
          <h2 className="mt-2 font-display text-[26px] leading-tight text-ink">
            {result.created} created · {result.updated} updated
            {result.failed.length > 0 && ` · ${result.failed.length} failed`}
          </h2>
          <p className="mt-2 text-[13px] text-ink-mid">
            Catalogue caches have been refreshed. The changes are already
            live on the public shop.
          </p>
        </div>
      </div>

      {result.failed.length > 0 && (
        <div className="mt-6 border-t border-ink/10 pt-6">
          <div className="text-[11px] uppercase tracking-label text-vermilion">
            Failed rows
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px] text-ink-mid">
            {result.failed.map((f) => (
              <li key={`${f.rowNumber}-${f.sku}`}>
                <span className="font-mono text-[12px] text-ink">
                  {f.sku || `row ${f.rowNumber}`}
                </span>
                : {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a
          href="/admin/products"
          className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90"
        >
          Back to catalogue
        </a>
        <button
          type="button"
          onClick={onStartOver}
          className="text-[12px] uppercase tracking-label text-ink-mid hover:text-ink"
        >
          Import another file
        </button>
      </div>
    </div>
  );
}

// ────────── tiny helpers ───────────────────────────────────────────────

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={cn("px-4 py-3 font-normal", className)}>{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
