"use client";

// ─────────────────────────────────────────────────────────────────────────
// BannerForm — shared create/edit form for homepage banners.
//
// Tabs switch the four locale translation panels. EN is required, others
// fall back to EN on the public site if blank. The media picker is an
// inline thumbnail grid, not a modal.
// ─────────────────────────────────────────────────────────────────────────

import { useActionState, useState } from "react";
import {
  createBannerAction,
  updateBannerAction,
  type ActionState,
} from "@/app/admin/banners/actions";
import { PLACEMENTS } from "@/app/admin/banners/placements";
import { Locale } from "@prisma/client";
import {
  Field,
  SaveBar,
  StatusBanner,
} from "@/components/admin/settings/settings-chrome";
import { MediaPicker, type PickerMedia } from "./media-picker";
import { cn } from "@/lib/utils";

const LOCALES: Locale[] = [Locale.EN, Locale.NL, Locale.FR, Locale.RU];

const INITIAL_STATE: ActionState = { ok: false };

type Translation = {
  locale: Locale;
  headline: string;
  subhead: string;
  ctaLabel: string;
};

export type BannerFormInitial = {
  id?: string;
  placement: string;
  ctaHref: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  mediaId: string | null;
  mediaUrl: string | null;
  mediaAlt: string | null;
  translations: Record<Locale, Translation>;
};

const EMPTY: BannerFormInitial = {
  placement: "home.hero",
  ctaHref: "",
  sortOrder: 0,
  isActive: true,
  startsAt: null,
  endsAt: null,
  mediaId: null,
  mediaUrl: null,
  mediaAlt: null,
  translations: {
    EN: { locale: "EN", headline: "", subhead: "", ctaLabel: "" },
    NL: { locale: "NL", headline: "", subhead: "", ctaLabel: "" },
    FR: { locale: "FR", headline: "", subhead: "", ctaLabel: "" },
    RU: { locale: "RU", headline: "", subhead: "", ctaLabel: "" },
  },
};

export function BannerForm({
  mode,
  library,
  initial,
}: {
  mode: "create" | "edit";
  library: PickerMedia[];
  initial?: BannerFormInitial;
}) {
  const data = initial ?? EMPTY;
  const action = mode === "create" ? createBannerAction : updateBannerAction;
  const [state, dispatch] = useActionState(action, INITIAL_STATE);
  const err = state.fieldErrors ?? {};

  const [activeLocale, setActiveLocale] = useState<Locale>("EN");

  return (
    <form action={dispatch} className="max-w-3xl space-y-6">
      {mode === "edit" && data.id && (
        <input type="hidden" name="id" value={data.id} />
      )}

      <Field
        label="Placement"
        hint="Where on the site this banner appears. Only placements the frontend renders are listed."
        error={err.placement?.[0]}
      >
        <select
          name="placement"
          defaultValue={data.placement}
          className="input"
          required
        >
          {PLACEMENTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Image" error={err.mediaId?.[0]}>
        <MediaPicker
          library={library}
          defaultMediaId={data.mediaId}
          defaultMediaUrl={data.mediaUrl}
          defaultMediaAlt={data.mediaAlt}
        />
      </Field>

      <Field
        label="Call-to-action URL"
        hint="Where clicking the banner takes the customer. Use a path (/shop) or full URL."
        error={err.ctaHref?.[0]}
      >
        <input
          name="ctaHref"
          defaultValue={data.ctaHref ?? ""}
          className="input"
          placeholder="/shop"
          maxLength={500}
        />
      </Field>

      {/* per-locale copy */}
      <div className="space-y-3 border-t border-ink/10 pt-6">
        <div className="text-[11px] uppercase tracking-label text-ink-mid">
          Copy · by language
        </div>
        <div className="flex flex-wrap gap-1 border-b border-ink/10">
          {LOCALES.map((l) => {
            const on = activeLocale === l;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setActiveLocale(l)}
                className={cn(
                  "border-b-2 px-3 py-1.5 text-[12px] uppercase tracking-label transition-colors",
                  on
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-mid hover:text-ink",
                )}
              >
                {l}
                {l === "EN" && <span className="ml-1 text-vermilion">*</span>}
              </button>
            );
          })}
        </div>

        {LOCALES.map((l) => {
          const t = data.translations[l];
          const on = activeLocale === l;
          const headlineErrKey = `translations.${l}.headline`;
          return (
            <div
              key={l}
              className={on ? "space-y-3" : "hidden"}
              aria-hidden={!on}
            >
              <Field
                label={l === "EN" ? "Headline (required)" : "Headline"}
                hint={
                  l === "EN"
                    ? "Shown as the big text on the banner."
                    : `${l} — falls back to EN if blank.`
                }
                error={err[headlineErrKey]?.[0]}
              >
                <input
                  name={`translations.${l}.headline`}
                  defaultValue={t.headline}
                  className="input"
                  maxLength={200}
                />
              </Field>
              <Field label="Subhead" hint="Optional secondary line under the headline.">
                <textarea
                  name={`translations.${l}.subhead`}
                  defaultValue={t.subhead}
                  rows={2}
                  className="input"
                  maxLength={400}
                />
              </Field>
              <Field label="CTA label" hint='e.g. "Shop now", "Discover".'>
                <input
                  name={`translations.${l}.ctaLabel`}
                  defaultValue={t.ctaLabel}
                  className="input max-w-xs"
                  maxLength={40}
                />
              </Field>
            </div>
          );
        })}
      </div>

      {/* scheduling + sort */}
      <div className="grid gap-4 border-t border-ink/10 pt-6 sm:grid-cols-3">
        <Field label="Sort order" hint="Lower shows first." error={err.sortOrder?.[0]}>
          <input
            name="sortOrder"
            type="number"
            min="0"
            step="1"
            defaultValue={data.sortOrder}
            className="input"
          />
        </Field>
        <Field label="Starts at" error={err.startsAt?.[0]}>
          <input
            name="startsAt"
            type="date"
            defaultValue={toYmd(data.startsAt)}
            className="input"
          />
        </Field>
        <Field label="Ends at" error={err.endsAt?.[0]}>
          <input
            name="endsAt"
            type="date"
            defaultValue={toYmd(data.endsAt)}
            className="input"
          />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-[12px] text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={data.isActive}
          className="mt-0.5 h-3.5 w-3.5 accent-ink"
        />
        <span>
          <span>Active</span>
          <span className="mt-0.5 block text-[11px] text-ink-mid">
            Only active banners show on the public site, subject to the
            schedule above.
          </span>
        </span>
      </label>

      <StatusBanner state={state} />
      <SaveBar />
    </form>
  );
}

function toYmd(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}
