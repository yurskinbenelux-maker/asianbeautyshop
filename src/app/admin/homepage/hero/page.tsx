// ─────────────────────────────────────────────────────────────────────────
// /admin/homepage/hero — pick the homepage hero variant.
//
// Three large cards explain what each variant looks like; current
// selection is highlighted. Below the picker, only the relevant config
// fields appear (video URL/poster for `video`, three image URLs for
// `collage`). Save → revalidates the public homepage.
// ─────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { requireCapability } from "@/lib/auth-roles";
import { readHomeHeroSettings } from "@/lib/queries/home-hero";
import { saveHomeHeroAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ saved?: string }>;

export default async function AdminHeroVariantPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireCapability("homepage.edit", "/admin/homepage");
  const sp = await searchParams;
  const cfg = await readHomeHeroSettings();

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
          Hero variant
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-mid">
          Switch the look of the very first thing visitors see. The same
          headline copy ({" "}
          <Link
            href="/admin/homepage/home.hero"
            className="text-ink underline decoration-vermilion underline-offset-2"
          >
            edit it here
          </Link>
          ) is reused across all three variants — only the visual
          treatment changes.
        </p>
      </header>

      {sp.saved === "1" && (
        <div className="mb-8 inline-flex items-center gap-2 border border-sage/40 bg-sage/10 px-3 py-2 text-[12px] text-sage">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Saved. Refresh the homepage to see it.
        </div>
      )}

      <form action={saveHomeHeroAction} className="space-y-8">
        {/* ── variant cards ──────────────────────────────────────── */}
        <fieldset>
          <legend className="text-[11px] uppercase tracking-label text-ink-mid">
            Variant
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <VariantCard
              value="typography"
              currentValue={cfg.variant}
              title="Typography"
              tagline="Default"
              description="Big editorial serif type with floating petals and a soft moon-jar curve. Brand voice does the work — no photography required."
            />
            <VariantCard
              value="video"
              currentValue={cfg.variant}
              title="Cinematic"
              tagline="Full-bleed video"
              description="A muted-loop 16:9 mp4 fills the screen, the headline overlaid in a darkened corner. Atmospheric, premium, but heavier on bandwidth."
            />
            <VariantCard
              value="collage"
              currentValue={cfg.variant}
              title="Editorial collage"
              tagline="Asymmetric products"
              description="Three product shots in a magazine-style asymmetric layout — large hero left, two smaller stacked right, type in the middle column."
            />
          </div>
        </fieldset>

        {/* ── video config ───────────────────────────────────────── */}
        <div className="border-t border-ink/10 pt-6">
          <h2 className="font-display text-[16px] text-ink">
            Cinematic video — only used when the Cinematic variant is selected
          </h2>
          <p className="mt-1 text-[12px] text-ink-mid">
            Recommended: H.264 mp4, 1920×1080, audio stripped, ≤ 8 MB.
            Upload via{" "}
            <Link
              href="/admin/media"
              className="text-ink underline decoration-vermilion underline-offset-2"
            >
              /admin/media
            </Link>{" "}
            then paste the URL.
          </p>
          <div className="mt-4 space-y-4">
            <Field
              label="Video URL"
              name="videoUrl"
              defaultValue={cfg.videoUrl}
              placeholder="https://…/hero.mp4"
            />
            <Field
              label="Poster image URL (optional)"
              name="videoPoster"
              defaultValue={cfg.videoPoster}
              placeholder="https://…/hero-poster.jpg"
              hint="Shown for first paint while the video downloads. Same dimensions as the video (1920×1080)."
            />
          </div>
        </div>

        {/* ── collage config ─────────────────────────────────────── */}
        <div className="border-t border-ink/10 pt-6">
          <h2 className="font-display text-[16px] text-ink">
            Collage products — only used when the Collage variant is selected
          </h2>
          <p className="mt-1 text-[12px] text-ink-mid">
            Three image URLs. Slot 1 is the large hero on the left
            (recommend 4:5 portrait, ~1200×1500). Slots 2 and 3 are the
            smaller stacked products on the right (square or 3:4
            portrait, ~800px on the long edge).
          </p>
          <div className="mt-4 space-y-4">
            <Field
              label="Hero product (large left)"
              name="collage0"
              defaultValue={cfg.collageUrls[0]}
              placeholder="https://…/product-hero.jpg"
            />
            <Field
              label="Smaller product 1 (upper right)"
              name="collage1"
              defaultValue={cfg.collageUrls[1]}
              placeholder="https://…/product-2.jpg"
            />
            <Field
              label="Smaller product 2 (lower right)"
              name="collage2"
              defaultValue={cfg.collageUrls[2]}
              placeholder="https://…/product-3.jpg"
            />
          </div>
        </div>

        {/* ── save ───────────────────────────────────────────────── */}
        <div className="border-t border-ink/10 pt-6">
          <button
            type="submit"
            className="inline-flex items-center gap-2 border border-ink bg-ink px-6 py-2.5 text-[12px] uppercase tracking-label text-rice hover:bg-ink/90"
          >
            Save hero
          </button>
          <p className="mt-3 text-[11px] text-ink-mid">
            Empty asset slots auto-fall back to the Typography variant on
            the public site, so a half-configured hero never breaks the
            homepage.
          </p>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function VariantCard({
  value,
  currentValue,
  title,
  tagline,
  description,
}: {
  value: string;
  currentValue: string;
  title: string;
  tagline: string;
  description: string;
}) {
  const active = value === currentValue;
  return (
    <label
      className={
        active
          ? "block cursor-pointer border border-ink bg-ink p-5 text-rice"
          : "block cursor-pointer border border-ink/15 bg-white p-5 text-ink hover:border-ink/40"
      }
    >
      <input
        type="radio"
        name="variant"
        value={value}
        defaultChecked={active}
        className="sr-only"
      />
      <div className="font-display text-[18px]">{title}</div>
      <div
        className={
          "mt-1 text-[10px] uppercase tracking-label " +
          (active ? "text-rice/70" : "text-ink-mid")
        }
      >
        {tagline}
      </div>
      <p
        className={
          "mt-3 text-[12px] leading-relaxed " +
          (active ? "text-rice/85" : "text-ink-mid")
        }
      >
        {description}
      </p>
      {active && (
        <div className="mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-label text-rice">
          <CheckCircle2 className="h-3 w-3" />
          Selected
        </div>
      )}
    </label>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
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
