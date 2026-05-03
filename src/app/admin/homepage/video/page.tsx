// ─────────────────────────────────────────────────────────────────────────
// /admin/homepage/video — configure the homepage video reel.
//
// Server component renders the form pre-filled with current settings.
// Save action writes back to the Setting row (key: home.video).
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { readHomeVideoSettings } from "@/lib/queries/home-video";
import { saveHomeVideoAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string }>;

export default async function AdminHomepageVideoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapability("homepage.edit", "/admin/homepage");
  const sp = await searchParams;
  const cfg = await readHomeVideoSettings();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/admin/homepage"
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-label text-ink-mid hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to website copy
      </Link>

      <header className="mt-4 mb-10">
        <div className="eyebrow">Homepage</div>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-ink">
          Video reel
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          Optional video section that appears between the hero and the
          bestsellers strip on the homepage. Pick one mode, paste up to
          three URLs (mp4 from /admin/media or any CDN), and save.
        </p>
      </header>

      {sp.saved === "1" && (
        <div className="mb-8 inline-flex items-center gap-2 border border-sage/40 bg-sage/10 px-3 py-2 text-[12px] text-sage">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Saved. Refresh the homepage to see it.
        </div>
      )}

      <form action={saveHomeVideoAction} className="space-y-8">
        {/* ── mode picker ─────────────────────────────────────────── */}
        <fieldset>
          <legend className="text-[11px] uppercase tracking-label text-ink-mid">
            Mode
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <ModeRadio
              name="mode"
              value="off"
              currentValue={cfg.mode}
              title="Off"
              hint="Hide the section. Hero flows straight into bestsellers."
            />
            <ModeRadio
              name="mode"
              value="single"
              currentValue={cfg.mode}
              title="Single 16:9"
              hint="One cinematic landscape clip. Recommended 1920×1080 mp4, under 8 MB for fast first paint."
            />
            <ModeRadio
              name="mode"
              value="trio"
              currentValue={cfg.mode}
              title="Trio of 9:16"
              hint="Three Instagram-style portrait reels side by side. Recommended 1080×1920 mp4 each, under 5 MB."
            />
          </div>
        </fieldset>

        {/* ── URLs ────────────────────────────────────────────────── */}
        <div className="space-y-5 border-t border-ink/10 pt-6">
          <p className="text-[12px] leading-relaxed text-ink-mid">
            Paste a public mp4 URL. Upload to{" "}
            <Link
              href="/admin/media"
              className="text-ink underline decoration-vermilion underline-offset-2"
            >
              /admin/media
            </Link>
            {" "}then copy the URL — or use any CDN.
          </p>
          <Field
            label="Video URL #1"
            hint="Used for both single mode and the first trio slot."
            name="url0"
            defaultValue={cfg.urls[0] ?? ""}
          />
          <Field
            label="Video URL #2 (trio only)"
            hint="Second portrait reel. Ignored in single mode."
            name="url1"
            defaultValue={cfg.urls[1] ?? ""}
          />
          <Field
            label="Video URL #3 (trio only)"
            hint="Third portrait reel. Ignored in single mode."
            name="url2"
            defaultValue={cfg.urls[2] ?? ""}
          />
          <Field
            label="Poster image URL (optional)"
            hint="Shown for first paint while videos download. Speeds up mobile load."
            name="poster"
            defaultValue={cfg.poster}
          />
        </div>

        {/* ── eyebrow + headline ─────────────────────────────────── */}
        <div className="space-y-5 border-t border-ink/10 pt-6">
          <p className="text-[12px] leading-relaxed text-ink-mid">
            Optional copy shown above the videos. Leave blank for pure
            footage.
          </p>
          <Field
            label="Eyebrow"
            hint="Small uppercase text above the headline. e.g. “The ritual, on film”."
            name="eyebrow"
            defaultValue={cfg.eyebrow}
          />
          <Field
            label="Headline"
            hint="One sentence. Keep it short."
            name="headline"
            defaultValue={cfg.headline}
          />
        </div>

        {/* ── submit ─────────────────────────────────────────────── */}
        <div className="border-t border-ink/10 pt-6">
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-2.5 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
          >
            Save video reel
          </button>
        </div>
      </form>
    </div>
  );
}

function ModeRadio({
  name,
  value,
  currentValue,
  title,
  hint,
}: {
  name: string;
  value: string;
  currentValue: string;
  title: string;
  hint: string;
}) {
  const active = value === currentValue;
  return (
    <label
      className={
        active
          ? "block cursor-pointer border border-ink bg-ink p-4 text-rice"
          : "block cursor-pointer border border-ink/15 bg-white p-4 text-ink hover:border-ink/40"
      }
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={active}
        className="sr-only"
      />
      <div className="font-display text-[14px]">{title}</div>
      <p
        className={
          "mt-1 text-[11px] leading-relaxed " +
          (active ? "text-rice/80" : "text-ink-mid")
        }
      >
        {hint}
      </p>
    </label>
  );
}

function Field({
  label,
  hint,
  name,
  defaultValue,
}: {
  label: string;
  hint?: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid focus:border-ink focus:outline-none"
        maxLength={2000}
      />
      {hint && (
        <span className="mt-1 block text-[11px] leading-relaxed text-ink-mid">
          {hint}
        </span>
      )}
    </label>
  );
}
