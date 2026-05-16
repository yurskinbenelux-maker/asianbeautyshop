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
import { FocalPointPicker } from "@/components/admin/marketing/focal-point-picker";
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
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
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
              title="Color block"
              tagline="Cream + vermilion"
              description="A 58/42 split. The cream side carries the editorial typography; the vermilion side is a saturated brand-color gallery wall with a single hero product framed at its center."
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

            {/* Focal-point picker reuses the popups' picker, fed the
                video POSTER as its editable canvas. Whatever crop the
                admin sets is applied to the real <video> element on
                the homepage via CSS object-position — so the
                cinematic crop on mobile can centre on the part of the
                frame an admin chooses (e.g. a face that lives in the
                right third of a wide 1920×1080 shot). Falls back
                gracefully when no poster has been set yet: the picker
                shows its empty state but the hidden inputs still
                submit so the saved focal points survive the form. */}
            <div>
              <div className="mb-2 text-[11px] uppercase tracking-label text-ink-mid">
                Video focus point
              </div>
              <FocalPointPicker
                imageUrl={cfg.videoPoster}
                videoUrl={cfg.videoUrl}
                initialDesktop={cfg.videoObjectPositionDesktop}
                initialMobile={cfg.videoObjectPositionMobile}
                desktopFieldName="videoObjectPositionDesktop"
                mobileFieldName="videoObjectPositionMobile"
              />
              <p className="mt-2 text-[11px] text-ink-mid">
                When a poster image is set above, the picker uses it as
                the editor canvas (lighter preview). If no poster is
                set, the picker falls back to the actual video — drag
                the pin while it plays. Same crop coordinates apply to
                the live hero either way.
              </p>
            </div>
          </div>
        </div>

        {/* ── color block carousel config ──────────────────────── */}
        <div className="border-t border-ink/10 pt-6">
          <h2 className="font-display text-[16px] text-ink">
            Color block carousel — only used when the Color block variant is selected
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
            Up to 5 products show on the vermilion side. Visitors click
            the chevrons on the left/right edges to cycle, or click the
            product image itself to jump to its product page. Empty
            slots are skipped — leave a slot blank to fewer products.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-mid">
            <span className="font-medium text-ink">Tip —</span> use 1:1
            square crops (~1000×1000). The product can be on any
            background — the cream-card frame gives it a clean edge
            against the brand-color wall.
          </p>

          <div className="mt-6 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <ProductSlot
                key={i}
                index={i}
                label={cfg.colorBlockProducts[i]?.label ?? ""}
                imageUrl={cfg.colorBlockProducts[i]?.imageUrl ?? ""}
                href={cfg.colorBlockProducts[i]?.href ?? ""}
              />
            ))}
          </div>

          {/* Legacy single-image fields, hidden — preserved on save so a
              site that hasn't migrated still has a fallback. */}
          <input
            type="hidden"
            name="collage0"
            value={cfg.collageUrls[0]}
          />
          <input
            type="hidden"
            name="collage1"
            value={cfg.collageUrls[1]}
          />
          <input
            type="hidden"
            name="collage2"
            value={cfg.collageUrls[2]}
          />
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

// ─────────────────────────────────────────────────────────────────────────
// One row of the carousel-product editor — three side-by-side fields
// (Label / Image / Link) plus a slot index pill on the left so an admin
// can match the form to the carousel order.
// ─────────────────────────────────────────────────────────────────────────

function ProductSlot({
  index,
  label,
  imageUrl,
  href,
}: {
  index: number;
  label: string;
  imageUrl: string;
  href: string;
}) {
  const num = (index + 1).toString().padStart(2, "0");
  const filled = imageUrl.trim().length > 0;
  return (
    <div
      className={
        "border bg-white/60 p-4 transition-colors " +
        (filled
          ? "border-ink/15"
          : "border-dashed border-ink/15")
      }
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="border border-ink/15 bg-rice-dim/50 px-2 py-0.5 font-mono text-[11px] text-ink-mid">
          N°{num}
        </span>
        <span className="text-[12px] text-ink-mid">
          {filled ? "Filled" : "Empty — leave blank to skip this slot"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
              Label
            </span>
            <input
              name={`product${index}Label`}
              defaultValue={label}
              placeholder="Cushion"
              className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
              maxLength={120}
            />
          </label>
        </div>
        <div className="md:col-span-5">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
              Image URL
            </span>
            <input
              name={`product${index}Image`}
              defaultValue={imageUrl}
              placeholder="https://…/cushion.jpg"
              className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
              maxLength={2000}
            />
          </label>
        </div>
        <div className="md:col-span-4">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-label text-ink-mid">
              Link to product
            </span>
            <input
              name={`product${index}Href`}
              defaultValue={href}
              placeholder="/shop/cushion-foundation"
              className="w-full border border-ink/15 bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-mid/60 focus:border-ink focus:outline-none"
              maxLength={2000}
            />
          </label>
        </div>
      </div>
    </div>
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
