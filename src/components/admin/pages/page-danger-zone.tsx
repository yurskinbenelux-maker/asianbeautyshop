"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { deletePageAction } from "@/app/admin/pages/actions";

export function PageDangerZone({ pageKey }: { pageKey: string }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border border-vermilion/20 bg-vermilion/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-vermilion" />
        <div className="flex-1">
          <h2 className="font-display text-[18px] text-ink">Delete page</h2>
          <p className="mt-1 text-[12px] text-ink-mid">
            Removes the page and every translation. Any link to{" "}
            <span className="font-mono">/legal/{pageKey}</span> will 404 after
            this. To just take it down temporarily, untick "Published" instead.
          </p>

          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-4 inline-flex items-center gap-2 border border-vermilion bg-vermilion px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-vermilion/90"
            >
              Delete page
            </button>
          ) : (
            <form action={deletePageAction} className="mt-4 flex flex-wrap gap-3">
              <input type="hidden" name="key" value={pageKey} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 border border-vermilion bg-vermilion px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-vermilion/90"
              >
                Yes, permanently delete
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-2 border border-ink/20 bg-white px-3 py-1.5 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
