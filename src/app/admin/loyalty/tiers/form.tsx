"use client";

// ─────────────────────────────────────────────────────────────────────────
// TierForm — create OR edit. Dual-purpose: omitted `initial` = create,
// passed `initial` = edit. Used both inline (list page) and on the
// per-id edit page.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useState } from "react";
import type { LoyaltyTier } from "@prisma/client";
import { saveTierAction } from "./actions";

type State = { ok: boolean; message?: string };

async function submit(_prev: State, formData: FormData): Promise<State> {
  return saveTierAction(formData);
}

export function TierForm({ initial }: { initial?: LoyaltyTier }) {
  const [state, action, pending] = useActionState<State, FormData>(submit, {
    ok: false,
  });
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) {
      setFlash(state.message ?? "Saved.");
      const t = setTimeout(() => setFlash(null), 2400);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={action} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
      {initial?.id ? (
        <input type="hidden" name="id" value={initial.id} />
      ) : null}

      <label className="block">
        <div className="text-[12px] text-ink">Name</div>
        <input
          type="text"
          name="name"
          required
          maxLength={40}
          defaultValue={initial?.name ?? ""}
          placeholder="Bloom"
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="block">
        <div className="text-[12px] text-ink">Threshold (lifetime points)</div>
        <input
          type="number"
          name="pointsThreshold"
          min={0}
          required
          defaultValue={initial?.pointsThreshold ?? 0}
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

      <label className="block">
        <div className="text-[12px] text-ink">Icon key (optional)</div>
        <input
          type="text"
          name="iconKey"
          maxLength={40}
          defaultValue={initial?.iconKey ?? ""}
          placeholder="peony"
          className="mt-1 block w-full border border-ink/15 bg-white px-3 py-2 text-[14px] focus:border-vermilion focus:outline-none"
        />
      </label>

      <label className="col-span-full inline-flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="h-4 w-4 border-ink/30 accent-vermilion"
        />
        Active
      </label>

      <div className="col-span-full flex items-center justify-between gap-4 pt-2">
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
          {pending ? "Saving…" : initial ? "Save tier" : "Add tier"}
        </button>
      </div>
    </form>
  );
}
