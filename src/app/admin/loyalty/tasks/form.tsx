"use client";

// ─────────────────────────────────────────────────────────────────────────
// TaskForm — create OR edit. Used inline on the list and per-id pages.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useState } from "react";
import type { LoyaltyTaskKind, LoyaltyTask } from "@prisma/client";
import { saveTaskAction } from "./actions";

type State = { ok: boolean; message?: string };

async function submit(_prev: State, formData: FormData): Promise<State> {
  return saveTaskAction(formData);
}

export function TaskForm({ initial }: { initial?: LoyaltyTask }) {
  const [state, action, pending] = useActionState<State, FormData>(submit, {
    ok: false,
  });
  const [flash, setFlash] = useState<string | null>(null);
  const [kind, setKind] = useState<LoyaltyTaskKind>(
    initial?.kind ?? "MANUAL_REVIEW",
  );

  useEffect(() => {
    if (state.ok) {
      setFlash(state.message ?? "Saved.");
      const t = setTimeout(() => setFlash(null), 2400);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={action} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <label className="block">
        <div className="text-[12px] text-ink">Slug</div>
        <input
          type="text"
          name="slug"
          required
          maxLength={60}
          pattern="[a-z0-9-]+"
          defaultValue={initial?.slug ?? ""}
          placeholder="instagram-repost"
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 font-mono text-[13px] focus:border-vermilion focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-ink-mid">
          Lowercase letters, numbers, dashes only. Used internally — can't be
          changed without breaking existing claim history.
        </p>
      </label>

      <label className="block">
        <div className="text-[12px] text-ink">Kind</div>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as LoyaltyTaskKind)}
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        >
          <option value="MANUAL_REVIEW">
            Manual review (customer submits, you approve)
          </option>
          <option value="AUTO">
            Automatic (awarded by code — for built-in events only)
          </option>
        </select>
      </label>

      <label className="block md:col-span-2">
        <div className="text-[12px] text-ink">Title</div>
        <input
          type="text"
          name="title"
          required
          maxLength={120}
          defaultValue={initial?.title ?? ""}
          placeholder="Repost on Instagram"
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="block md:col-span-2">
        <div className="text-[12px] text-ink">Short description</div>
        <input
          type="text"
          name="description"
          maxLength={500}
          defaultValue={initial?.description ?? ""}
          placeholder="Follow + repost our story for 250 points"
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="block md:col-span-2">
        <div className="text-[12px] text-ink">Instructions (HTML allowed)</div>
        <textarea
          name="instructionsHtml"
          rows={5}
          maxLength={8000}
          defaultValue={initial?.instructionsHtml ?? ""}
          placeholder="<p>Follow @yurskin and repost our latest story to your feed. Paste your IG handle below — we'll verify within 48 hours.</p>"
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 font-mono text-[12px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="block">
        <div className="text-[12px] text-ink">Points awarded</div>
        <input
          type="number"
          name="points"
          min={0}
          required
          defaultValue={initial?.points ?? 100}
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="block">
        <div className="text-[12px] text-ink">Sort order</div>
        <input
          type="number"
          name="sortOrder"
          min={0}
          defaultValue={initial?.sortOrder ?? 0}
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="block md:col-span-2">
        <div className="text-[12px] text-ink">Icon key (optional)</div>
        <input
          type="text"
          name="iconKey"
          maxLength={40}
          defaultValue={initial?.iconKey ?? ""}
          placeholder="instagram"
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="inline-flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          name="requiresProofUrl"
          defaultChecked={initial?.requiresProofUrl ?? true}
          className="h-4 w-4 border-ink/30 accent-vermilion"
        />
        Requires proof URL
      </label>

      <label className="inline-flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          name="isRepeatable"
          defaultChecked={initial?.isRepeatable ?? false}
          className="h-4 w-4 border-ink/30 accent-vermilion"
        />
        Repeatable (customer can claim multiple times)
      </label>

      <label className="md:col-span-2 inline-flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="h-4 w-4 border-ink/30 accent-vermilion"
        />
        Active — visible in customer drawer
      </label>

      <div className="md:col-span-2 flex items-center justify-between gap-4 pt-2">
        <div className="text-[12px]">
          {flash ? (
            <span className="text-sage">{flash}</span>
          ) : state.message && !state.ok ? (
            <span className="text-vermilion">{state.message}</span>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 border border-ink bg-ink px-5 py-2 text-[12px] uppercase tracking-label text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
        >
          {pending ? "Saving…" : initial?.id ? "Save task" : "Add task"}
        </button>
      </div>
    </form>
  );
}
