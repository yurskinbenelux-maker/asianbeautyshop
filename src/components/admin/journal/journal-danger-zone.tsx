"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { deleteJournalPostAction } from "@/app/admin/journal/actions";

export function JournalDangerZone({ id }: { id: string }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border border-vermilion/20 bg-vermilion/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-vermilion" />
        <div className="flex-1">
          <h2 className="font-display text-[18px] text-ink">Delete post</h2>
          <p className="mt-1 text-[12px] text-ink-mid">
            Removes the post and all of its translations. This cannot be undone.
            If you only want to hide it, set the status to Draft instead.
          </p>

          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-4 inline-flex items-center gap-2 border border-vermilion bg-vermilion px-3 py-1.5 text-[11px] uppercase tracking-label text-white hover:bg-vermilion/90"
            >
              Delete post
            </button>
          ) : (
            <form action={deleteJournalPostAction} className="mt-4 flex flex-wrap gap-3">
              <input type="hidden" name="id" value={id} />
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
